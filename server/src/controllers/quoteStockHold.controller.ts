import { NextFunction, Request, Response } from "express";
import Quotation, { quoteStatus } from "../models/quotation.model";
import Product from "../models/products.model";
import StockReservation from "../models/stockReservation.model";
import Job from "../models/job.model";
import { getEmployeeData } from "../common/utils/util";
import { getActiveReservationFilter, getBalances, release, reserve } from "../services/stock.service";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

/**
 * Stock held for a Won quotation before it becomes a job. Stock is normally reserved when the deal is
 * approved and the job is created; for an urgent order the sales person can hold it from the moment the
 * quote is won, for a few days. The hold lapses on its own if no job is created in that time, turns into
 * the job's reservation when the deal is approved, and is released if the quote leaves Won.
 */

const HOLD_SOURCE = 'Quotation';
const MAX_HOLD_DAYS = 30;

/** Product lines the customer is buying: every non-optional line, plus optional ones they accepted. */
const holdLinesFor = (quote: any) => {
    const byProduct = new Map<string, { productId: string; detail: string; quantity: number }>();
    (quote.optionalItems || []).forEach((option: any) => {
        // Options are alternatives, so a product is held once, for the largest quantity any option needs.
        const inOption = new Map<string, { productId: string; detail: string; quantity: number }>();
        (option.items || []).forEach((item: any) => {
            const counted = !item.isOptional || item.includeInTotal || item.customerDecision === 'accepted';
            if (!counted) return;
            (item.itemDetails || []).forEach((detail: any) => {
                const productId = detail.productId ? String(detail.productId?._id || detail.productId) : '';
                const quantity = Number(detail.quantity) || 0;
                if (!ObjectId.isValid(productId) || quantity <= 0) return;
                const line = inOption.get(productId) || { productId, detail: detail.detail, quantity: 0 };
                line.quantity += quantity;
                inOption.set(productId, line);
            });
        });
        inOption.forEach((line, productId) => {
            const current = byProduct.get(productId);
            if (!current || current.quantity < line.quantity) byProduct.set(productId, line);
        });
    });
    return [...byProduct.values()];
};

/** Free quantity per product: stock on hand less active reservations, other than `excludeQuoteId`'s holds. */
const freeStockByProduct = async (productIds: string[], excludeQuoteId?: any) => {
    const ids = productIds.map((id) => new ObjectId(id));
    const balances = await getBalances(ids);
    const match: any = { ...getActiveReservationFilter(), product: { $in: ids } };
    if (excludeQuoteId) match.$nor = [{ sourceType: HOLD_SOURCE, quote: new ObjectId(String(excludeQuoteId)) }];
    const reserved: any[] = ids.length
        ? await StockReservation.aggregate([{ $match: match }, { $group: { _id: '$product', quantity: { $sum: '$quantity' } } }])
        : [];
    const reservedBy = new Map<string, number>(reserved.map((r: any) => [String(r._id), r.quantity || 0]));
    const free = new Map<string, number>();
    ids.forEach((id) => free.set(String(id), Math.max(0, (balances.get(String(id))?.onHand || 0) - (reservedBy.get(String(id)) || 0))));
    return free;
};

const activeHoldsFor = (quoteId: any) => StockReservation.find({
    ...getActiveReservationFilter(),
    sourceType: HOLD_SOURCE,
    quote: new ObjectId(String(quoteId)),
}).populate('product', 'partNo itemCode productDescription unitOfMeasure').lean();

/**
 * Ends every active hold of a quote: `Converted` when the job takes it over, `Released` otherwise.
 * Never throws, so it cannot block the caller's own change.
 */
export const releaseQuoteStockHolds = async (quoteId: any, reason: string, employeeId?: any, status: 'Released' | 'Converted' = 'Released') => {
    try {
        if (!quoteId || !ObjectId.isValid(String(quoteId))) return 0;
        return await release({ quote: quoteId, sourceType: HOLD_SOURCE }, reason, employeeId, status);
    } catch (error) {
        console.error('Failed to release quotation stock holds:', error);
        return 0;
    }
};

const loadHoldableQuote = async (quoteId: string) => {
    if (!ObjectId.isValid(quoteId)) return { error: { status: 400, message: 'Invalid quotation' } };
    const quote: any = await Quotation.findById(quoteId).lean();
    if (!quote || quote.isDeleted) return { error: { status: 404, message: 'Quote not found' } };
    return { quote };
};

/** What a hold would cover: each product line with the quantity needed, free now, and already held. */
const holdSummary = async (quote: any) => {
    const lines = holdLinesFor(quote);
    const [free, holds, products] = await Promise.all([
        freeStockByProduct(lines.map((l) => l.productId), quote._id),
        activeHoldsFor(quote._id),
        Product.find({ _id: { $in: lines.map((l) => new ObjectId(l.productId)) } }).select('partNo itemCode productDescription unitOfMeasure').lean(),
    ]);
    const productById = new Map<string, any>(products.map((p: any) => [String(p._id), p]));
    const heldByProduct = new Map<string, number>();
    holds.forEach((h: any) => {
        const id = String(h.product?._id || h.product);
        heldByProduct.set(id, (heldByProduct.get(id) || 0) + (h.quantity || 0));
    });
    const expiresAt = holds.map((h: any) => new Date(h.expiresAt).getTime()).sort((a, b) => a - b)[0];
    return {
        lines: lines.map((line) => {
            const product = productById.get(line.productId);
            return {
                productId: line.productId,
                partNo: product?.partNo || product?.itemCode || '',
                detail: product?.productDescription || line.detail,
                uom: product?.unitOfMeasure || '',
                requested: line.quantity,
                available: free.get(line.productId) || 0,
                held: heldByProduct.get(line.productId) || 0,
            };
        }),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        canHold: quote.status === quoteStatus.Won && quote.dealData?.status !== 'approved',
    };
};

export const getQuoteStockHold = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quote, error } = await loadHoldableQuote(req.params.quoteId);
        if (error) return res.status(error.status).json({ message: error.message });
        return res.status(200).json({ success: true, data: await holdSummary(quote) });
    } catch (error) {
        next(error);
    }
};

/**
 * Holds the free stock for a Won quote for `days` days. Running it again replaces the earlier hold, so it
 * also extends or shortens it. A line short of stock is held for what is free and reported back.
 */
export const holdQuoteStock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quote, error } = await loadHoldableQuote(req.params.quoteId);
        if (error) return res.status(error.status).json({ message: error.message });
        if (quote.status !== quoteStatus.Won) return res.status(400).json({ message: 'Stock can only be held for a Won quotation' });
        if (quote.dealData?.status === 'approved') return res.status(409).json({ message: 'The deal is approved, so the job already reserves this stock' });
        const job = await Job.findOne({ quoteId: quote._id, isDeleted: { $ne: true } }).select('_id').lean();
        if (job) return res.status(409).json({ message: 'A job already exists for this quotation, so its stock is reserved there' });

        const days = Math.floor(Number(req.body?.days));
        if (!(days >= 1 && days <= MAX_HOLD_DAYS)) return res.status(400).json({ message: `Hold for 1 to ${MAX_HOLD_DAYS} days` });
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: 'Unauthorized' });

        const lines = holdLinesFor(quote);
        if (!lines.length) return res.status(400).json({ message: 'No line on this quotation is a catalogue product, so there is no stock to hold' });

        await releaseQuoteStockHolds(quote._id, 'Replaced by a new hold', employee._id);
        const free = await freeStockByProduct(lines.map((l) => l.productId), quote._id);
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        let held = 0;
        for (const line of lines) {
            const quantity = Math.min(line.quantity, free.get(line.productId) || 0);
            if (quantity <= 0) continue;
            await reserve({
                product: line.productId,
                quantity,
                sourceType: 'Quotation',
                quote: quote._id,
                customer: quote.client,
                expiresAt,
                createdBy: employee._id,
            });
            held++;
        }
        const summary = await holdSummary(quote);
        const short = summary.lines.filter((l) => l.held < l.requested).length;
        const message = !held
            ? 'Nothing is in stock for this quotation, so nothing was held'
            : `Stock held for ${days} day(s)${short ? `; ${short} line(s) are short and were held for what is free` : ''}`;
        return res.status(200).json({ success: true, message, data: summary });
    } catch (error) {
        next(error);
    }
};

export const releaseQuoteStockHold = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quote, error } = await loadHoldableQuote(req.params.quoteId);
        if (error) return res.status(error.status).json({ message: error.message });
        const employee = await getEmployeeData((req as any).user);
        const released = await releaseQuoteStockHolds(quote._id, 'Released manually', employee?._id);
        return res.status(200).json({ success: true, message: released ? 'Stock hold released' : 'There was no active hold', data: await holdSummary(quote) });
    } catch (error) {
        next(error);
    }
};
