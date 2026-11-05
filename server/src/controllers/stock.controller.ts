import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Product from "../models/products.model";
import Warehouse from "../models/warehouse.model";
import GRN from "../models/grn.model";
import Job from "../models/job.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import DeliveryNote from "../models/deliveryNote.model";
import StockMovement, { ADJUSTMENT_REASONS } from "../models/stockMovement.model";
import StockReservation from "../models/stockReservation.model";
import { StockHold } from "../models/stockHold.model";
import { getEmployeeData } from "../common/utils/util";
import { logAudit } from "../services/audit.service";
import {
    StockError,
    getActiveReservationFilter,
    getAvailability,
    balanceOf,
    getLastReceiptCosts,
    post,
    release,
} from "../services/stock.service";

const { ObjectId } = Types;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asObjectId = (value: any) => new ObjectId(String(value));
const notDeleted = { isDeleted: { $ne: true } };

const fail = (res: Response, next: NextFunction, error: any) => {
    if (error instanceof StockError) return res.status(error.status).json({ success: false, message: error.message, details: error.details });
    console.error(error);
    return next(error);
};

const productLabel = (product: any) => ({
    itemCode: product?.itemCode || '',
    partNo: product?.partNo || '',
    productDescription: product?.productDescription || product?.productName || '',
    uom: product?.unitOfMeasure || '',
});

/**
 * Where each product's quarantined stock came from: the job id, or the PO number when there is no job.
 * A delivery-note rejection resolves through the note's job; a GRN rejection through its PO (and that PO's job).
 */
const quarantineRefsByProduct = async (productIds: string[]): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    if (!productIds.length) return result;
    const moves: any[] = await StockMovement.find({
        product: { $in: productIds.map(asObjectId) }, stockStatus: 'Quarantine', quantityIn: { $gt: 0 },
        reversalOf: { $exists: false }, ...notDeleted,
    }).select('product referenceType referenceId referenceNo lpoNo').lean();

    const idsOf = (types: string[]) => [...new Set(moves.filter((m) => types.includes(m.referenceType) && m.referenceId).map((m) => String(m.referenceId)))];
    const dns: any[] = await DeliveryNote.find({ _id: { $in: idsOf(['DnRejection', 'DeliveryNote']) } }).select('jobId').lean();
    const grns: any[] = await GRN.find({ _id: { $in: idsOf(['GRN']) } }).select('purchaseOrderId').lean();
    const pos: any[] = await PurchaseOrder.find({ _id: { $in: grns.map((g) => g.purchaseOrderId).filter(Boolean) } }).select('poNo jobId purchaseId').lean();
    const prs: any[] = await PurchaseRequest.find({ _id: { $in: pos.map((p) => p.purchaseId).filter(Boolean) } }).select('jobId').lean();
    const prJob = new Map(prs.map((p) => [String(p._id), p.jobId]));
    const jobIds = [...dns.map((d) => d.jobId), ...pos.map((p) => p.jobId || prJob.get(String(p.purchaseId)))].filter(Boolean);
    const jobs: any[] = await Job.find({ _id: { $in: jobIds } }).select('jobId').lean();
    const jobNo = new Map(jobs.map((j) => [String(j._id), j.jobId]));
    const dnById = new Map(dns.map((d) => [String(d._id), d]));
    const grnById = new Map(grns.map((g) => [String(g._id), g]));
    const poById = new Map(pos.map((p) => [String(p._id), p]));

    const refs = new Map<string, Set<string>>();
    moves.forEach((m) => {
        let ref = '';
        if (m.referenceType === 'DnRejection' || m.referenceType === 'DeliveryNote') {
            ref = jobNo.get(String(dnById.get(String(m.referenceId))?.jobId)) || '';
        } else if (m.referenceType === 'GRN') {
            const po = poById.get(String(grnById.get(String(m.referenceId))?.purchaseOrderId));
            ref = jobNo.get(String(po?.jobId || prJob.get(String(po?.purchaseId)))) || po?.poNo || m.lpoNo || '';
        } else {
            ref = m.lpoNo || '';
        }
        if (!ref) return;
        const key = String(m.product);
        if (!refs.has(key)) refs.set(key, new Set());
        refs.get(key)!.add(ref);
    });
    refs.forEach((set, key) => result.set(key, [...set].join(', ')));
    return result;
};

/**
 * Stock by product: on hand, reserved, available and quarantined, with the warehouse split.
 * A product shows once it has any stock movement or an active reservation.
 */
export const getStockOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page = '1', row = '15', search, productCategory, view = 'all', sortKey, sortDir } = req.query;

        const grouped: any[] = await StockMovement.aggregate([
            { $match: notDeleted },
            {
                $group: {
                    _id: { product: '$product', warehouse: '$warehouse' },
                    onHand: { $sum: { $cond: [{ $eq: ['$stockStatus', 'Quarantine'] }, 0, { $subtract: ['$quantityIn', '$quantityOut'] }] } },
                    quarantined: { $sum: { $cond: [{ $eq: ['$stockStatus', 'Quarantine'] }, { $subtract: ['$quantityIn', '$quantityOut'] }, 0] } },
                    lastDate: { $max: '$movementDate' },
                },
            },
        ]);
        const reservedRows: any[] = await StockReservation.aggregate([
            { $match: getActiveReservationFilter() },
            { $group: { _id: '$product', quantity: { $sum: '$quantity' } } },
        ]);

        const byProduct = new Map<string, { onHand: number; quarantined: number; reserved: number; lastDate: Date | null; warehouses: { warehouseId: string; quantity: number; quarantined: number }[] }>();
        const entryFor = (id: string) => {
            if (!byProduct.has(id)) byProduct.set(id, { onHand: 0, quarantined: 0, reserved: 0, lastDate: null, warehouses: [] });
            return byProduct.get(id)!;
        };
        grouped.forEach((g) => {
            const entry = entryFor(String(g._id.product));
            entry.onHand += g.onHand || 0;
            entry.quarantined += g.quarantined || 0;
            if (g.lastDate && (!entry.lastDate || g.lastDate > entry.lastDate)) entry.lastDate = g.lastDate;
            if (g._id.warehouse && (g.onHand || g.quarantined)) entry.warehouses.push({ warehouseId: String(g._id.warehouse), quantity: g.onHand || 0, quarantined: g.quarantined || 0 });
        });
        reservedRows.forEach((r) => { entryFor(String(r._id)).reserved = r.quantity || 0; });

        const productFilter: any = { ...notDeleted, _id: { $in: [...byProduct.keys()].map(asObjectId) } };
        if (productCategory && ObjectId.isValid(String(productCategory))) productFilter.productCategory = asObjectId(productCategory);
        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(escapeRegex(searchTerm), 'i');
            productFilter.$or = [{ partNo: regex }, { itemCode: regex }, { productDescription: regex }, { productName: regex }];
        }

        const [products, warehouses, costs] = await Promise.all([
            Product.find(productFilter).select('partNo itemCode productName productDescription unitOfMeasure productCategory reorderPoint').populate('productCategory', 'categoryName').lean(),
            Warehouse.find({}).select('wareHouseName').lean(),
            getLastReceiptCosts([...byProduct.keys()]),
        ]);
        // Stock is valued at the last PO price, or at the unit cost entered on a later stock adjustment (whichever is newer).
        const productKeys = [...byProduct.keys()];
        const poCosts = new Map<string, { cost: number; date: number }>();
        const poRows: any[] = await PurchaseOrder.find({ 'items.partNo': { $in: productKeys }, poStatus: { $nin: ['Cancelled', 'Rejected', 'Draft'] } })
            .select('items.partNo items.unitCost poDate createdAt').sort({ poDate: -1, createdAt: -1 }).lean();
        for (const po of poRows) {
            const date = new Date(po.poDate || po.createdAt || 0).getTime();
            for (const line of po.items || []) {
                const pid = String(line.partNo);
                if (!poCosts.has(pid) && Number(line.unitCost) > 0) poCosts.set(pid, { cost: Number(line.unitCost), date });
            }
        }
        const adjustRows: any[] = await StockMovement.aggregate([
            { $match: { ...notDeleted, product: { $in: productKeys.map(asObjectId) }, movementType: 'Adjustment', quantityIn: { $gt: 0 }, unitCost: { $gt: 0 }, reversalOf: { $exists: false } } },
            { $sort: { movementDate: -1, createdDate: -1 } },
            { $group: { _id: '$product', unitCost: { $first: '$unitCost' }, date: { $first: '$movementDate' } } },
        ]);
        const adjustCosts = new Map<string, { cost: number; date: number }>(adjustRows.map((r) => [String(r._id), { cost: Number(r.unitCost), date: new Date(r.date || 0).getTime() }]));
        const costFor = (id: string): number => {
            const po = poCosts.get(id);
            const adj = adjustCosts.get(id);
            if (po && adj) return adj.date >= po.date ? adj.cost : po.cost;
            return adj?.cost || po?.cost || costs.get(id)?.unitCost || 0;
        };
        const warehouseName = new Map<string, string>(warehouses.map((w: any) => [String(w._id), w.wareHouseName]));
        const quarantineRefs = await quarantineRefsByProduct(products.filter((p: any) => (byProduct.get(String(p._id))?.quarantined || 0) > 0).map((p: any) => String(p._id)));

        let rows = products.map((product: any) => {
            const id = String(product._id);
            const entry = byProduct.get(id)!;
            const unitCost = costFor(id);
            const totalQuantity = entry.onHand + entry.quarantined;
            return {
                productId: id,
                ...productLabel(product),
                productCategory: product.productCategory?.categoryName || '',
                reorderPoint: product.reorderPoint || 0,
                onHandQuantity: totalQuantity,
                reservedQuantity: entry.reserved,
                availableQuantity: Math.max(0, entry.onHand - entry.reserved),
                shortfallQuantity: Math.max(0, entry.reserved - entry.onHand),
                quarantinedQuantity: entry.quarantined,
                quarantineRef: quarantineRefs.get(id) || '',
                lastMovementDate: entry.lastDate,
                stockValue: totalQuantity * unitCost,
                warehouses: entry.warehouses
                    .map((w) => ({ warehouseId: w.warehouseId, warehouseName: warehouseName.get(w.warehouseId) || 'Warehouse', quantity: w.quantity, quarantined: w.quarantined }))
                    .sort((a, b) => b.quantity - a.quantity),
            };
        }).map((r) => ({ ...r, warehouseText: r.warehouses.map((w) => `${w.warehouseName}: ${w.quantity}`).join(', ') }));

        const summary = {
            totalItems: rows.length,
            availableCount: rows.filter((r) => r.availableQuantity > 0).length,
            reservedCount: rows.filter((r) => r.reservedQuantity > 0).length,
            quarantineCount: rows.filter((r) => r.quarantinedQuantity > 0).length,
        };
        if (view === 'available') rows = rows.filter((r) => r.availableQuantity > 0);
        if (view === 'reserved') rows = rows.filter((r) => r.reservedQuantity > 0);
        if (view === 'quarantine') rows = rows.filter((r) => r.quarantinedQuantity > 0);

        // Default order: most recent stock movement first.
        const hasSort = typeof sortKey === 'string' && !!sortKey;
        const key = hasSort ? (sortKey as string) : 'lastMovementDate';
        const dir = hasSort ? (sortDir === 'desc' ? -1 : 1) : -1;
        rows.sort((a: any, b: any) => {
            let av = a[key], bv = b[key];
            if (av instanceof Date || bv instanceof Date || key === 'lastMovementDate') {
                av = av ? new Date(av).getTime() : 0;
                bv = bv ? new Date(bv).getTime() : 0;
            }
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * dir;
        });

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.max(parseInt(row as string, 10) || 15, 1);
        return res.status(200).json({
            success: true,
            message: 'Stock fetched successfully',
            data: {
                overview: rows.slice((pageNum - 1) * rowNum, pageNum * rowNum),
                summary,
                pagination: { total: rows.length, page: pageNum, pages: Math.ceil(rows.length / rowNum), limit: rowNum },
            },
        });
    } catch (error) {
        return fail(res, next, error);
    }
};

/** Read-only movement history, newest first. Filter by product, warehouse, type or document number. */
export const getStockLedger = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page = '1', row = '20', product, warehouse, movementType, search } = req.query;
        const filter: any = { ...notDeleted };
        if (product && ObjectId.isValid(String(product))) filter.product = asObjectId(product);
        if (warehouse && ObjectId.isValid(String(warehouse))) filter.warehouse = asObjectId(warehouse);

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(escapeRegex(searchTerm), 'i');
            const matches = await Product.find({ ...notDeleted, $or: [{ partNo: regex }, { itemCode: regex }, { productDescription: regex }] }).select('_id').limit(200).lean();
            filter.$or = [{ referenceNo: regex }, { remarks: regex }, { product: { $in: matches.map((p: any) => p._id) } }];
        }
        // Tab counts ignore the type tab itself so every tab shows its own total.
        const baseFilter = { ...filter };
        if (movementType) filter.movementType = String(movementType);

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.min(Math.max(parseInt(row as string, 10) || 20, 1), 200);
        const [movements, total, typeCounts] = await Promise.all([
            StockMovement.find(filter)
                .populate('product', 'partNo itemCode productDescription unitOfMeasure')
                .populate('warehouse', 'wareHouseName')
                .populate('createdBy', 'firstName lastName')
                .sort({ movementDate: -1, createdDate: -1, _id: -1 })
                .skip((pageNum - 1) * rowNum)
                .limit(rowNum)
                .lean(),
            StockMovement.countDocuments(filter),
            StockMovement.aggregate([{ $match: baseFilter }, { $group: { _id: '$movementType', count: { $sum: 1 } } }]),
        ]);
        const counts: Record<string, number> = {};
        let all = 0;
        for (const c of typeCounts) { counts[c._id] = c.count; all += c.count; }
        counts['all'] = all;
        return res.status(200).json({
            success: true,
            message: 'Stock ledger fetched successfully',
            data: { movements, counts, pagination: { total, page: pageNum, pages: Math.ceil(total / rowNum), limit: rowNum } },
        });
    } catch (error) {
        return fail(res, next, error);
    }
};

/** Availability for any module: ?productIds=a,b&warehouse=. Open to every signed-in user, read-only. */
export const getStockAvailability = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const ids = String(req.query.productIds || '').split(',').map((v) => v.trim()).filter((v) => ObjectId.isValid(v));
        if (!ids.length) return res.status(400).json({ success: false, message: 'productIds is required' });
        const warehouse = req.query.warehouse && ObjectId.isValid(String(req.query.warehouse)) ? String(req.query.warehouse) : undefined;
        const availability = await getAvailability(ids, warehouse);
        return res.status(200).json({ success: true, data: Object.fromEntries(availability) });
    } catch (error) {
        return fail(res, next, error);
    }
};

const ADD_ONLY = new Set(['Opening stock']);
const REMOVE_ONLY = new Set(['Damaged', 'Lost / missing']);

/** A manual stock correction. A reason is always required; Other also needs remarks. */
export const adjustStock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { product, warehouse, direction, quantity, reason, remarks, unitCost } = req.body || {};
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });

        if (!ObjectId.isValid(String(product || '')) || !ObjectId.isValid(String(warehouse || ''))) throw new StockError('Choose a product and a warehouse', 400);
        if (!(Number(quantity) > 0)) throw new StockError('Quantity must be greater than zero', 400);
        if (!ADJUSTMENT_REASONS.includes(reason)) throw new StockError('Choose a reason', 400);
        if (direction !== 'add' && direction !== 'remove') throw new StockError('Choose whether to add or remove stock', 400);
        if (ADD_ONLY.has(reason) && direction !== 'add') throw new StockError(`${reason} can only add stock`, 400);
        if (REMOVE_ONLY.has(reason) && direction !== 'remove') throw new StockError(`${reason} can only remove stock`, 400);
        if (reason === 'Other' && !String(remarks || '').trim()) throw new StockError('Remarks are required when the reason is Other', 400);

        const [productDoc, warehouseDoc] = await Promise.all([Product.findOne({ _id: product, ...notDeleted }).select('partNo type'), Warehouse.findOne({ _id: warehouse, ...notDeleted })]);
        if (!productDoc) throw new StockError('Product not found', 404);
        if (!warehouseDoc) throw new StockError('Warehouse not found', 404);

        const costs = await getLastReceiptCosts([product]);
        const movement = await post({
            product,
            warehouse,
            type: 'Adjustment',
            direction: direction === 'add' ? 'in' : 'out',
            quantity: Number(quantity),
            unitCost: unitCost !== undefined && unitCost !== '' ? Number(unitCost) : costs.get(String(product))?.unitCost,
            referenceType: 'Adjustment',
            referenceNo: `ADJ-${Date.now().toString(36).toUpperCase()}`,
            reason,
            remarks,
            createdBy: employee._id,
        });
        return res.status(201).json({ success: true, message: 'Stock adjusted', data: movement });
    } catch (error) {
        return fail(res, next, error);
    }
};

/** Moves quarantined stock back to sellable stock, or writes it off. Stock still owed to a supplier-return hold is excluded. */
export const releaseQuarantine = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { product, warehouse, quantity, action, remarks } = req.body || {};
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!ObjectId.isValid(String(product || '')) || !ObjectId.isValid(String(warehouse || ''))) throw new StockError('Choose a product and a warehouse', 400);
        if (!(Number(quantity) > 0)) throw new StockError('Quantity must be greater than zero', 400);
        if (action !== 'Release' && action !== 'WriteOff') throw new StockError('Choose release or write off', 400);
        if (action === 'WriteOff' && !String(remarks || '').trim()) throw new StockError('Remarks are required to write stock off', 400);

        // Stock waiting on an open supplier-return hold belongs to that hold, which settles it.
        const openHolds: any[] = await StockHold.find({ ...notDeleted, stockEntryId: { $exists: true }, unresolvedQty: { $gt: 0 } }).select('stockEntryId unresolvedQty').lean();
        const holdMovements: any[] = openHolds.length
            ? await StockMovement.find({ _id: { $in: openHolds.map((h) => h.stockEntryId) }, product: asObjectId(product), warehouse: asObjectId(warehouse) }).select('_id').lean()
            : [];
        const heldIds = new Set(holdMovements.map((m) => String(m._id)));
        const held = openHolds.filter((h) => heldIds.has(String(h.stockEntryId))).reduce((sum, h) => sum + (h.unresolvedQty || 0), 0);

        const quarantined = await balanceOf(product, warehouse, 'Quarantine');
        const free = Math.max(0, quarantined - held);
        if (Number(quantity) > free) {
            throw new StockError(`Only ${free} unit(s) can be moved${held ? `; ${held} are tied to an open supplier return` : ''}`, 409);
        }

        const costs = await getLastReceiptCosts([product]);
        const unitCost = costs.get(String(product))?.unitCost;
        const common = { product, warehouse, quantity: Number(quantity), unitCost, referenceType: 'Quarantine', remarks, createdBy: employee._id };
        await post({ ...common, type: action === 'Release' ? 'Release' : 'Adjustment', direction: 'out', bucket: 'Quarantine', reason: action === 'WriteOff' ? 'Damaged' : undefined });
        if (action === 'Release') await post({ ...common, type: 'Release', direction: 'in', bucket: 'Available' });
        return res.status(200).json({ success: true, message: action === 'Release' ? 'Released to stock' : 'Written off' });
    } catch (error) {
        return fail(res, next, error);
    }
};

// ---------------------------------------------------------------- returns

type ReturnKind = 'customer' | 'supplier';

interface ReturnLine {
    product: string;
    partNo: string;
    description: string;
    uom: string;
    maxQuantity: number;
    /** GRN lines only: what arrived and what was rejected on the receipt. */
    receivedQty?: number;
    rejectedQty?: number;
    rejectionReason?: string;
    perWarehouse: { warehouse: string; quantity: number }[];
}

/**
 * What can still come back against a delivery note (customer return) or GRN (supplier return): the
 * quantity the document moved, less earlier returns and DN rejections, worked out from the ledger.
 */
const loadReturnSource = async (kind: ReturnKind, sourceId: string) => {
    if (!ObjectId.isValid(sourceId)) throw new StockError('Invalid document', 400);
    const isCustomer = kind === 'customer';
    const doc: any = isCustomer ? await DeliveryNote.findById(sourceId).lean() : await GRN.findOne({ _id: sourceId, ...notDeleted }).lean();
    if (!doc) throw new StockError(`${isCustomer ? 'Delivery note' : 'GRN'} not found`, 404);
    if (isCustomer && ['Draft', 'Cancelled'].includes(doc.status)) throw new StockError('Only a posted delivery note can have returns', 400);

    const sourceType = isCustomer ? 'DeliveryNote' : 'GRN';
    const returnType = isCustomer ? 'DN Return' : 'GRN Return';
    const [moved, returned, rejected] = await Promise.all([
        StockMovement.find({
            ...notDeleted,
            referenceType: sourceType,
            referenceId: asObjectId(sourceId),
            movementType: isCustomer ? 'Delivery' : 'Quarantine',
            stockStatus: isCustomer ? 'Available' : 'Quarantine'
        }).lean(),
        StockMovement.find({ ...notDeleted, referenceType: returnType, referenceId: asObjectId(sourceId) }).lean(),
        isCustomer ? StockMovement.find({ ...notDeleted, referenceType: 'DnRejection', referenceId: asObjectId(sourceId) }).lean() : Promise.resolve([] as any[]),
    ]);

    // net quantity per product and warehouse that this document still has "out in the world"
    const remaining = new Map<string, Map<string, number>>();
    const add = (productId: string, warehouseId: string, qty: number) => {
        if (!remaining.has(productId)) remaining.set(productId, new Map());
        const wh = remaining.get(productId)!;
        wh.set(warehouseId, (wh.get(warehouseId) || 0) + qty);
    };
    moved.forEach((m: any) => add(String(m.product), String(m.warehouse), isCustomer ? (m.quantityOut - m.quantityIn) : (m.quantityIn - m.quantityOut)));
    [...returned, ...rejected].forEach((m: any) => add(String(m.product), String(m.warehouse), -((m.quantityIn || 0) + (m.quantityOut || 0)) * (m.reversalOf ? -1 : 1)));

    const products = await Product.find({ _id: { $in: [...remaining.keys()].map(asObjectId) } }).select('partNo itemCode productDescription unitOfMeasure').lean();
    const lines: ReturnLine[] = products.map((p: any) => {
        const perWarehouse = [...(remaining.get(String(p._id))?.entries() || [])].filter(([, q]) => q > 0).map(([warehouse, quantity]) => ({ warehouse, quantity }));
        const line: ReturnLine = {
            product: String(p._id),
            partNo: p.partNo || p.itemCode || '',
            description: p.productDescription || '',
            uom: p.unitOfMeasure || '',
            maxQuantity: perWarehouse.reduce((sum, w) => sum + w.quantity, 0),
            perWarehouse,
        };
        if (!isCustomer) {
            const codes = [p.itemCode, p.partNo].filter(Boolean).map((c: string) => String(c).trim().toLowerCase());
            const desc = String(p.productDescription || '').trim().toLowerCase();
            const matches = (doc.items || []).filter((i: any) => {
                const itemCode = String(i.partNo || i.itemCode || '').trim().toLowerCase();
                return (itemCode && codes.includes(itemCode)) || (desc && String(i.description || i.productDescription || '').trim().toLowerCase() === desc);
            });
            line.receivedQty = matches.reduce((s: number, i: any) => s + (Number(i.receivedQty) || 0), 0);
            line.rejectedQty = matches.reduce((s: number, i: any) => s + (Number(i.rejectedQty) || 0), 0);
            // Whatever the GRN sent to quarantine for this product is what it rejected, even if the line could not be matched.
            if (!line.rejectedQty) {
                line.rejectedQty = moved.filter((m: any) => String(m.product) === String(p._id)).reduce((s: number, m: any) => s + (m.quantityIn - m.quantityOut), 0);
            }
            // The reason typed on the GRN line; if the line could not be matched, use the lone rejected GRN line's reason.
            const reasonSource = matches.length ? matches : (doc.items || []).filter((i: any) => Number(i.rejectedQty) > 0);
            const reasonItems = matches.length || reasonSource.length === 1 ? reasonSource : [];
            line.rejectionReason = Array.from(new Set(reasonItems.map((i: any) => String(i.rejectionReason || '').trim()).filter(Boolean))).join('; ');
        }
        return line;
    }).filter((l) => l.maxQuantity > 0);

    return { doc, lines, sourceType, returnType, number: isCustomer ? doc.dnNo : doc.grnNo };
};

export const getReturnSource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const kind = req.params.kind as ReturnKind;
        if (kind !== 'customer' && kind !== 'supplier') return res.status(400).json({ success: false, message: 'Unknown return type' });
        const source = await loadReturnSource(kind, req.params.id);
        return res.status(200).json({ success: true, data: { number: source.number, lines: source.lines } });
    } catch (error) {
        return fail(res, next, error);
    }
};

/**
 * A customer return puts goods back (+qty) against a delivery note; a supplier return sends accepted goods
 * back (-qty) against a GRN. Both refer to the source document and cannot exceed what it moved.
 */
export const createStockReturn = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { kind, sourceId, lines, reason, remarks, toQuarantine, resolution } = req.body || {};
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (kind !== 'customer' && kind !== 'supplier') throw new StockError('Unknown return type', 400);
        if (!String(reason || '').trim()) throw new StockError('A reason is required', 400);
        if (kind === 'supplier' && !String(resolution || '').trim()) throw new StockError('Enter the resolution', 400);
        const requested = (Array.isArray(lines) ? lines : []).filter((l: any) => Number(l.quantity) > 0);
        if (!requested.length) throw new StockError('Enter a quantity for at least one item', 400);

        const source = await loadReturnSource(kind, String(sourceId));
        const isCustomer = kind === 'customer';
        const plan: { product: string; warehouse: string; quantity: number; remarks: string }[] = [];
        for (const line of requested) {
            const sourceLine = source.lines.find((l) => l.product === String(line.product));
            if (!sourceLine) throw new StockError('An item on the return is not on this document', 400);
            const quantity = Number(line.quantity);
            if (quantity > sourceLine.maxQuantity) throw new StockError(`${sourceLine.partNo}: only ${sourceLine.maxQuantity} can be returned`, 409);
            let remaining = quantity;
            for (const w of sourceLine.perWarehouse) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, w.quantity);
                plan.push({ product: sourceLine.product, warehouse: w.warehouse, quantity: take, remarks: String(line.remarks || '').trim() });
                remaining -= take;
            }
        }

        const costs = await getLastReceiptCosts([...new Set(plan.map((p) => p.product))]);
        // A supplier return needs the goods still in stock: check every line before posting any of them.
        if (!isCustomer) {
            for (const step of plan) {
                const balance = await balanceOf(step.product, step.warehouse, 'Quarantine');
                if (step.quantity > balance) throw new StockError('Not enough stock left in the warehouse to send this back', 409);
            }
        }
        for (const step of plan) {
            await post({
                product: step.product,
                warehouse: step.warehouse,
                type: 'Return',
                direction: isCustomer ? 'in' : 'out',
                quantity: step.quantity,
                bucket: isCustomer ? (toQuarantine ? 'Quarantine' : 'Available') : 'Quarantine',
                unitCost: costs.get(step.product)?.unitCost,
                referenceType: source.returnType,
                referenceId: sourceId,
                referenceNo: source.number,
                reason,
                remarks: [step.remarks, remarks].filter(Boolean).join(' - ') || remarks,
                createdBy: employee._id,
            });
        }
        if (!isCustomer) {
            await GRN.findByIdAndUpdate(sourceId, {
                $set: {
                    outcomeStatus: 'Return in Progress',
                    invoiceStatus: 'Blocked by Return',
                    returnResolution: String(resolution || '').trim() || undefined,
                    returnDispatchedAt: new Date(),
                }
            });
            await logAudit(req, { entityType: 'grn', entityId: sourceId, entityLabel: source.number, action: 'return-sent', summary: `Rejected goods sent back to supplier${resolution ? ` (${resolution})` : ''}` });
        }
        return res.status(201).json({ success: true, message: isCustomer ? 'Customer return recorded' : 'Supplier return recorded' });
    } catch (error) {
        return fail(res, next, error);
    }
};

export const resolveSupplierReturn = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!ObjectId.isValid(req.params.id)) throw new StockError('Invalid GRN', 400);
        const grn = await GRN.findOneAndUpdate(
            { _id: req.params.id, ...notDeleted, outcomeStatus: 'Return in Progress' },
            { $set: { outcomeStatus: 'Resolved', invoiceStatus: 'Ready for Invoice', returnResolvedAt: new Date(), returnResolvedBy: employee._id } },
            { new: true }
        );
        if (!grn) throw new StockError('No return in progress for this GRN', 409);
        await logAudit(req, { entityType: 'grn', entityId: grn._id, entityLabel: grn.grnNo, action: 'return-resolved', summary: 'Supplier return resolved, invoice ready' });
        return res.status(200).json({ success: true, message: 'Supplier return resolved; invoice is ready' });
    } catch (error) {
        return fail(res, next, error);
    }
};

// ----------------------------------------------------------- reservations

export const getStockReservations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { product } = req.query;
        const filter: any = { ...getActiveReservationFilter() };
        if (product && ObjectId.isValid(String(product))) filter.product = asObjectId(product);
        const reservations = await StockReservation.find(filter)
            .populate('product', 'partNo itemCode productDescription')
            .populate({ path: 'quote', select: 'quoteId createdBy', populate: { path: 'createdBy', select: 'firstName lastName' } })
            .populate({
                path: 'job',
                select: 'jobId quoteId',
                populate: { path: 'quoteId', select: 'quoteId createdBy', populate: { path: 'createdBy', select: 'firstName lastName' } },
            })
            .populate('customer', 'companyName')
            .populate('createdBy', 'firstName lastName')
            .sort({ createdDate: -1 })
            .limit(200)
            .lean();
        return res.status(200).json({ success: true, data: reservations });
    } catch (error) {
        return fail(res, next, error);
    }
};

export const getStockItemDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const productId = String(req.query.product || '');
        if (!ObjectId.isValid(productId)) return res.status(400).json({ success: false, message: 'Invalid product' });
        const pid = asObjectId(productId);

        const product: any = await Product.findById(pid)
            .populate('productCategory', 'categoryName')
            .populate('defaultVendor', 'supplierName')
            .lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Last order: the most recent PO that carries this product (cancelled and rejected orders do not count).
        const lastPo: any = await PurchaseOrder.findOne({ 'items.partNo': pid, poStatus: { $nin: ['Cancelled', 'Rejected', 'Draft'] } })
            .sort({ poDate: -1, createdAt: -1 })
            .populate('supplierId', 'supplierName')
            .populate('jobId', 'jobId')
            .lean();
        const poLine = lastPo?.items?.find((i: any) => String(i.partNo) === productId);

        // Last receipt: newest GRN whose line is this product, matched by item code, part no, then description.
        const codes = [product.itemCode, product.partNo].filter(Boolean).map((c: string) => String(c).trim().toLowerCase());
        const grns: any[] = await GRN.find({ isDeleted: { $ne: true } })
            .sort({ grnDate: -1 })
            .limit(300)
            .populate({ path: 'purchaseOrderId', select: 'poNo supplierId currency items', populate: { path: 'supplierId', select: 'supplierName' } })
            .lean();
        let lastGrn: any = null;
        let grnLine: any = null;
        for (const g of grns) {
            const line = (g.items || []).find((i: any) => codes.includes(String(i.partNo || '').trim().toLowerCase()))
                || (g.items || []).find((i: any) => String(i.itemDescription || '').trim().toLowerCase() === String(product.productDescription || '').trim().toLowerCase());
            if (line) { lastGrn = g; grnLine = line; break; }
        }
        const grnPoLine = lastGrn?.purchaseOrderId?.items?.find((i: any) => String(i.partNo) === productId);

        // Jobs holding this product, with the job's own status.
        const reservations: any[] = await StockReservation.find({ ...getActiveReservationFilter(), product: pid, job: { $ne: null } })
            .populate({ path: 'job', select: 'jobId status', })
            .populate('customer', 'companyName')
            .sort({ createdDate: -1 })
            .lean();
        const jobs = reservations.map((r) => ({
            jobId: r.job?.jobId || '-',
            status: r.job?.status || '-',
            customer: r.customer?.companyName || '-',
            reservedQty: r.quantity,
            reservedOn: r.createdDate,
        }));

        return res.status(200).json({
            success: true,
            data: {
                item: {
                    itemCode: product.itemCode,
                    partNo: product.partNo,
                    description: product.productDescription,
                    brand: product.brand,
                    category: product.productCategory?.categoryName,
                    uom: product.unitOfMeasure,
                    type: product.type,
                    specs: product.specs,
                    reorderPoint: product.reorderPoint,
                    leadTimeDays: product.leadTimeDays,
                    defaultVendor: product.defaultVendor?.supplierName,
                    estimatedCost: product.estimatedCost,
                    defaultSellingPrice: product.defaultSellingPrice,
                },
                lastPo: lastPo ? {
                    poNo: lastPo.poNo,
                    poDate: lastPo.poDate,
                    status: lastPo.poStatus,
                    supplier: lastPo.supplierId?.supplierName,
                    currency: lastPo.currency,
                    quantity: poLine?.quantity,
                    unitCost: poLine?.unitCost,
                    totalCost: poLine?.totalCost,
                    job: lastPo.jobId?.jobId,
                } : null,
                lastGrn: lastGrn ? {
                    grnNo: lastGrn.grnNo,
                    grnDate: lastGrn.grnDate,
                    poNo: lastGrn.purchaseOrderId?.poNo,
                    supplier: lastGrn.purchaseOrderId?.supplierId?.supplierName,
                    currency: lastGrn.purchaseOrderId?.currency,
                    receivedQty: grnLine.receivedQty,
                    acceptedQty: grnLine.acceptedQty,
                    rejectedQty: grnLine.rejectedQty,
                    unitCost: grnPoLine?.unitCost,
                } : null,
                jobs,
            }
        });
    } catch (error) {
        return fail(res, next, error);
    }
};

export const releaseStockReservation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation' });
        const released = await release({ id: req.params.id }, String(req.body?.reason || 'Released manually'), employee._id);
        if (!released) return res.status(404).json({ success: false, message: 'Active reservation not found' });
        return res.status(200).json({ success: true, message: 'Reservation released' });
    } catch (error) {
        return fail(res, next, error);
    }
};
