import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Product from "../models/products.model";
import Warehouse from "../models/warehouse.model";
import GRN from "../models/grn.model";
import DeliveryNote from "../models/deliveryNote.model";
import StockMovement, { ADJUSTMENT_REASONS } from "../models/stockMovement.model";
import StockReservation from "../models/stockReservation.model";
import { StockHold } from "../models/stockHold.model";
import { getEmployeeData } from "../common/utils/util";
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
                },
            },
        ]);
        const reservedRows: any[] = await StockReservation.aggregate([
            { $match: getActiveReservationFilter() },
            { $group: { _id: '$product', quantity: { $sum: '$quantity' } } },
        ]);

        const byProduct = new Map<string, { onHand: number; quarantined: number; reserved: number; warehouses: { warehouseId: string; quantity: number; quarantined: number }[] }>();
        const entryFor = (id: string) => {
            if (!byProduct.has(id)) byProduct.set(id, { onHand: 0, quarantined: 0, reserved: 0, warehouses: [] });
            return byProduct.get(id)!;
        };
        grouped.forEach((g) => {
            const entry = entryFor(String(g._id.product));
            entry.onHand += g.onHand || 0;
            entry.quarantined += g.quarantined || 0;
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
        const warehouseName = new Map<string, string>(warehouses.map((w: any) => [String(w._id), w.wareHouseName]));

        let rows = products.map((product: any) => {
            const id = String(product._id);
            const entry = byProduct.get(id)!;
            const unitCost = costs.get(id)?.unitCost || 0;
            return {
                productId: id,
                ...productLabel(product),
                productCategory: product.productCategory?.categoryName || '',
                reorderPoint: product.reorderPoint || 0,
                onHandQuantity: entry.onHand,
                reservedQuantity: entry.reserved,
                availableQuantity: Math.max(0, entry.onHand - entry.reserved),
                shortfallQuantity: Math.max(0, entry.reserved - entry.onHand),
                quarantinedQuantity: entry.quarantined,
                stockValue: entry.onHand * unitCost,
                warehouses: entry.warehouses
                    .map((w) => ({ warehouseId: w.warehouseId, warehouseName: warehouseName.get(w.warehouseId) || 'Warehouse', quantity: w.quantity, quarantined: w.quarantined }))
                    .sort((a, b) => b.quantity - a.quantity),
            };
        }).map((r) => ({ ...r, warehouseText: r.warehouses.map((w) => `${w.warehouseName}: ${w.quantity}`).join(', ') }));

        const isLow = (r: any) => r.availableQuantity <= 0 || r.shortfallQuantity > 0 || (r.reorderPoint > 0 && r.availableQuantity <= r.reorderPoint);
        const summary = {
            totalItems: rows.length,
            exceptionCount: rows.filter(isLow).length,
            quarantineCount: rows.filter((r) => r.quarantinedQuantity > 0).length,
        };
        if (view === 'exceptions') rows = rows.filter(isLow);
        if (view === 'quarantine') rows = rows.filter((r) => r.quarantinedQuantity > 0);

        const key = typeof sortKey === 'string' && sortKey ? sortKey : 'partNo';
        const dir = sortDir === 'desc' ? -1 : 1;
        rows.sort((a: any, b: any) => {
            const av = a[key], bv = b[key];
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
        if (movementType) filter.movementType = String(movementType);

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(escapeRegex(searchTerm), 'i');
            const matches = await Product.find({ ...notDeleted, $or: [{ partNo: regex }, { itemCode: regex }, { productDescription: regex }] }).select('_id').limit(200).lean();
            filter.$or = [{ referenceNo: regex }, { remarks: regex }, { product: { $in: matches.map((p: any) => p._id) } }];
        }

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.min(Math.max(parseInt(row as string, 10) || 20, 1), 200);
        const [movements, total] = await Promise.all([
            StockMovement.find(filter)
                .populate('product', 'partNo itemCode productDescription unitOfMeasure')
                .populate('warehouse', 'wareHouseName')
                .populate('createdBy', 'firstName lastName')
                .sort({ movementDate: -1, createdDate: -1, _id: -1 })
                .skip((pageNum - 1) * rowNum)
                .limit(rowNum)
                .lean(),
            StockMovement.countDocuments(filter),
        ]);
        return res.status(200).json({
            success: true,
            message: 'Stock ledger fetched successfully',
            data: { movements, pagination: { total, page: pageNum, pages: Math.ceil(total / rowNum), limit: rowNum } },
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

const ADD_ONLY = new Set(['Opening stock', 'Found']);
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
        return {
            product: String(p._id),
            partNo: p.partNo || p.itemCode || '',
            description: p.productDescription || '',
            uom: p.unitOfMeasure || '',
            maxQuantity: perWarehouse.reduce((sum, w) => sum + w.quantity, 0),
            perWarehouse,
        };
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
        if (kind === 'supplier' && !['Replacement', 'Credit Note'].includes(resolution)) throw new StockError('Choose Replacement or Credit Note', 400);
        const requested = (Array.isArray(lines) ? lines : []).filter((l: any) => Number(l.quantity) > 0);
        if (!requested.length) throw new StockError('Enter a quantity for at least one item', 400);

        const source = await loadReturnSource(kind, String(sourceId));
        const isCustomer = kind === 'customer';
        const plan: { product: string; warehouse: string; quantity: number }[] = [];
        for (const line of requested) {
            const sourceLine = source.lines.find((l) => l.product === String(line.product));
            if (!sourceLine) throw new StockError('An item on the return is not on this document', 400);
            const quantity = Number(line.quantity);
            if (quantity > sourceLine.maxQuantity) throw new StockError(`${sourceLine.partNo}: only ${sourceLine.maxQuantity} can be returned`, 409);
            let remaining = quantity;
            for (const w of sourceLine.perWarehouse) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, w.quantity);
                plan.push({ product: sourceLine.product, warehouse: w.warehouse, quantity: take });
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
                remarks,
                createdBy: employee._id,
            });
        }
        if (!isCustomer) {
            await GRN.findByIdAndUpdate(sourceId, {
                $set: {
                    outcomeStatus: 'Return in Progress',
                    invoiceStatus: 'Blocked by Return',
                    returnResolution: resolution,
                    returnDispatchedAt: new Date(),
                }
            });
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
            .populate('quote', 'quoteId')
            .populate('job', 'jobId')
            .populate('customer', 'companyName')
            .sort({ createdDate: -1 })
            .limit(200)
            .lean();
        return res.status(200).json({ success: true, data: reservations });
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
