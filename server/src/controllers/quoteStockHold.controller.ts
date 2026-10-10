import { NextFunction, Request, Response } from "express";
import Quotation, { quoteStatus } from "../models/quotation.model";
import Product from "../models/products.model";
import StockEntry from "../models/stockEntry.model";
import StockBlock from "../models/stockBlock.model";
import StockReservation from "../models/stockReservation.model";
import StockMovement from "../models/stockMovement.model";
import Job from "../models/job.model";
import { getEmployeeData } from "../common/utils/util";
import { getActiveReservationFilter } from "./stockEntry.controller";
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

/** Free quantity per product: stock on hand less active blocks and active reservations, other than `excludeQuoteId`'s holds. */
const freeStockByProduct = async (productIds: string[], excludeQuoteId?: any) => {
    const ids = productIds.map((id) => new ObjectId(id));
    const now = new Date();
    const entries: any[] = ids.length
        ? await StockEntry.find({ partNo: { $in: ids }, isDeleted: { $ne: true }, isQuarantined: { $ne: true } }).select('partNo quantity').lean()
        : [];
    const blocks: any[] = entries.length
        ? await StockBlock.find({ stockEntryId: { $in: entries.map((e) => e._id) }, isDeleted: { $ne: true }, toDate: { $gte: now } }).select('stockEntryId quantity').lean()
        : [];
    const blocked = new Map<string, number>();
    blocks.forEach((b: any) => blocked.set(String(b.stockEntryId), (blocked.get(String(b.stockEntryId)) || 0) + (b.quantity || 0)));
    const free = new Map<string, number>();
    entries.forEach((e: any) => {
        const id = String(e.partNo);
        free.set(id, (free.get(id) || 0) + Math.max(0, (e.quantity || 0) - (blocked.get(String(e._id)) || 0)));
    });
    const match: any = { ...getActiveReservationFilter(now), product: { $in: ids } };
    if (excludeQuoteId) match.$nor = [{ sourceType: HOLD_SOURCE, quote: new ObjectId(String(excludeQuoteId)) }];
    const reserved: any[] = ids.length
        ? await StockReservation.aggregate([{ $match: match }, { $group: { _id: '$product', quantity: { $sum: '$quantity' } } }])
        : [];
    reserved.forEach((r: any) => free.set(String(r._id), Math.max(0, (free.get(String(r._id)) || 0) - (r.quantity || 0))));
    return free;
};

const activeHoldsFor = (quoteId: any) => StockReservation.find({
    ...getActiveReservationFilter(),
    sourceType: HOLD_SOURCE,
    quote: new ObjectId(String(quoteId)),
}).populate('product', 'partNo itemCode productDescription unitOfMeasure').lean();

/**
 * Ends every active hold of a quote: `Converted` when the job takes it over, `Released` otherwise. Each
 * one is written to the stock movement log. Never throws, so it cannot block the caller's own change.
 */
export const releaseQuoteStockHolds = async (quoteId: any, reason: string, employeeId?: any, status: 'Released' | 'Converted' = 'Released') => {
    try {
        if (!quoteId || !ObjectId.isValid(String(quoteId))) return 0;
        const holds: any[] = await StockReservation.find({
            status: 'Active', isDeleted: { $ne: true }, sourceType: HOLD_SOURCE, quote: new ObjectId(String(quoteId)),
        }).lean();
        for (const hold of holds) {
            await StockReservation.updateOne(
                { _id: hold._id, status: 'Active' },
                { $set: { status, releaseReason: reason, releasedAt: new Date(), releasedBy: employeeId, updatedDate: new Date() } }
            );
            await StockMovement.create({
                product: hold.product,
                movementType: 'Release',
                reservedQuantity: hold.quantity,
                referenceType: HOLD_SOURCE,
                referenceId: quoteId,
                remarks: reason,
                movementDate: new Date(),
                createdBy: employeeId,
                createdDate: new Date(),
            });
        }
        return holds.length;
    } catch (error) {
        console.error('Failed to release quotation stock holds:', error);
        return 0;
    }
};

/** Marks reservations whose period has ended as Expired (availability already ignores them) and logs the release. */
export const expireLapsedReservations = async () => {
    try {
        const now = new Date();
        const lapsed: any[] = await StockReservation.find({ status: 'Active', isDeleted: { $ne: true }, expiresAt: { $lt: now } }).limit(500).lean();
        for (const reservation of lapsed) {
            const claim = await StockReservation.updateOne(
                { _id: reservation._id, status: 'Active' },
                { $set: { status: 'Expired', releaseReason: 'Hold period ended', releasedAt: now, updatedDate: now } }
            );
            if (!claim.modifiedCount) continue;
            await StockMovement.create({
                product: reservation.product,
                warehouse: reservation.warehouse,
                movementType: 'Release',
                reservedQuantity: reservation.quantity,
                referenceType: reservation.sourceType,
                referenceId: reservation.sourceRef || reservation._id,
                remarks: reservation.sourceType === HOLD_SOURCE ? 'Quotation hold lapsed: no job was created in time' : 'Reservation expired',
                movementDate: now,
                createdBy: reservation.createdBy,
                createdDate: now,
            });
        }
    } catch (error) {
        console.error('Reservation expiry error:', error);
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
            await StockReservation.create({
                product: line.productId,
                quote: quote._id,
                customer: quote.client,
                sourceType: HOLD_SOURCE,
                sourceRef: quote._id,
                quantity,
                reservedFrom: new Date(),
                expiresAt,
                status: 'Active',
                createdBy: employee._id,
                createdDate: new Date(),
                updatedDate: new Date(),
                isDeleted: false,
            });
            await StockMovement.create({
                product: line.productId,
                movementType: 'Reservation',
                reservedQuantity: quantity,
                referenceType: HOLD_SOURCE,
                referenceId: quote._id,
                referenceNo: quote.quoteId,
                remarks: `Held for Won quotation ${quote.quoteId} until ${expiresAt.toISOString().slice(0, 10)}`,
                movementDate: new Date(),
                createdBy: employee._id,
                createdDate: new Date(),
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
