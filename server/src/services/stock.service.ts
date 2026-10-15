import { Types } from "mongoose";
import StockMovement, { StockBucket, StockMovementType } from "../models/stockMovement.model";
import StockReservation from "../models/stockReservation.model";

/**
 * The single place stock quantity is read or written. Other modules ask it for availability, reserve
 * and release stock, and post receipts, deliveries, returns and adjustments. Nothing else edits a quantity.
 *
 * Quantity lives only in StockMovement rows (on hand = sum of in - out). A reservation is a claim kept in
 * StockReservation and never moves stock. Available = on hand - reserved.
 *
 * Posting is not wrapped in a database transaction: two people posting the same last unit within
 * milliseconds could both pass the stock check. Acceptable at this scale; revisit with replica-set transactions.
 */

export class StockError extends Error {
    status: number;
    details?: any;
    constructor(message: string, status = 409, details?: any) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

const oid = (value: any) => new Types.ObjectId(String(value?._id || value));

const notDeleted = { isDeleted: { $ne: true } };

/** Reservations that currently claim stock: active, and (when they carry an expiry) not yet expired. */
export const getActiveReservationFilter = (now = new Date()) => ({
    isDeleted: { $ne: true },
    status: 'Active',
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }],
});

export interface Availability {
    onHand: number;
    reserved: number;
    available: number;
    quarantined: number;
}

const emptyAvailability = (): Availability => ({ onHand: 0, reserved: 0, available: 0, quarantined: 0 });

/** On hand and quarantined per product, optionally for one warehouse. */
export const getBalances = async (productIds: any[], warehouse?: any): Promise<Map<string, { onHand: number; quarantined: number }>> => {
    const result = new Map<string, { onHand: number; quarantined: number }>();
    if (!productIds.length) return result;
    const match: any = { ...notDeleted, product: { $in: productIds.map(oid) } };
    if (warehouse) match.warehouse = oid(warehouse);
    const rows = await StockMovement.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$product',
                onHand: { $sum: { $cond: [{ $eq: ['$stockStatus', 'Quarantine'] }, 0, { $subtract: ['$quantityIn', '$quantityOut'] }] } },
                quarantined: { $sum: { $cond: [{ $eq: ['$stockStatus', 'Quarantine'] }, { $subtract: ['$quantityIn', '$quantityOut'] }, 0] } },
            },
        },
    ]);
    rows.forEach((r: any) => result.set(String(r._id), { onHand: r.onHand || 0, quarantined: r.quarantined || 0 }));
    return result;
};

/** Quantity claimed by active reservations per product. With a warehouse, only reservations pinned to it count. */
export const getReservedQuantities = async (productIds: any[], warehouse?: any, excludeJob?: any): Promise<Map<string, number>> => {
    const reserved = new Map<string, number>();
    if (!productIds.length) return reserved;
    const match: any = { ...getActiveReservationFilter(), product: { $in: productIds.map(oid) } };
    if (warehouse) match.warehouse = oid(warehouse);
    if (excludeJob) match.job = { $ne: oid(excludeJob) };
    const rows = await StockReservation.aggregate([
        { $match: match },
        { $group: { _id: '$product', quantity: { $sum: '$quantity' } } },
    ]);
    rows.forEach((r: any) => reserved.set(String(r._id), r.quantity || 0));
    return reserved;
};

/** On hand, reserved and available per product. Every requested product is present in the result. */
export const getAvailability = async (productIds: any[], warehouse?: any): Promise<Map<string, Availability>> => {
    const [balances, reserved] = await Promise.all([getBalances(productIds, warehouse), getReservedQuantities(productIds, warehouse)]);
    const result = new Map<string, Availability>();
    productIds.forEach((id) => {
        const key = String(id?._id || id);
        const balance = balances.get(key);
        const onHand = balance?.onHand || 0;
        const reservedQty = reserved.get(key) || 0;
        result.set(key, { ...emptyAvailability(), onHand, reserved: reservedQty, available: Math.max(0, onHand - reservedQty), quarantined: balance?.quarantined || 0 });
    });
    return result;
};

/** The unit cost of the latest receipt per product: the cost used for adjustments, deliveries and stock value. */
export const getLastReceiptCosts = async (productIds: any[]): Promise<Map<string, { unitCost: number; date: Date; supplier?: any; lpoNo?: string; referenceNo?: string }>> => {
    const costs = new Map<string, { unitCost: number; date: Date; supplier?: any; lpoNo?: string; referenceNo?: string }>();
    if (!productIds.length) return costs;
    const rows = await StockMovement.aggregate([
        { $match: { ...notDeleted, product: { $in: productIds.map(oid) }, movementType: 'Receipt', stockStatus: { $ne: 'Quarantine' }, reversalOf: { $exists: false } } },
        { $sort: { movementDate: -1, createdDate: -1 } },
        { $group: { _id: '$product', unitCost: { $first: '$unitCost' }, date: { $first: '$movementDate' }, supplier: { $first: '$supplier' }, lpoNo: { $first: '$lpoNo' }, referenceNo: { $first: '$referenceNo' } } },
    ]);
    rows.forEach((r: any) => costs.set(String(r._id), { unitCost: r.unitCost || 0, date: r.date, supplier: r.supplier, lpoNo: r.lpoNo, referenceNo: r.referenceNo }));
    return costs;
};

export interface PostInput {
    product: any;
    warehouse: any;
    type: StockMovementType;
    direction: 'in' | 'out';
    quantity: number;
    bucket?: StockBucket;
    unitCost?: number;
    referenceType?: string;
    referenceId?: any;
    referenceNo?: string;
    reason?: string;
    remarks?: string;
    supplier?: any;
    lpoNo?: string;
    reversalOf?: any;
    movementDate?: Date;
    createdBy?: any;
}

/** Quantity in a product's bucket and warehouse right now. */
const balanceOf = async (product: any, warehouse: any, bucket: StockBucket): Promise<number> => {
    const rows = await StockMovement.aggregate([
        { $match: { ...notDeleted, product: oid(product), warehouse: oid(warehouse), stockStatus: bucket === 'Quarantine' ? 'Quarantine' : { $ne: 'Quarantine' } } },
        { $group: { _id: null, qty: { $sum: { $subtract: ['$quantityIn', '$quantityOut'] } } } },
    ]);
    return rows[0]?.qty || 0;
};

/** Writes one ledger row. Refuses a posting that would take the bucket below zero. */
export const post = async (input: PostInput) => {
    const quantity = Number(input.quantity);
    if (!input.product || !Types.ObjectId.isValid(String(input.product?._id || input.product))) throw new StockError('A valid product is required', 400);
    if (!input.warehouse || !Types.ObjectId.isValid(String(input.warehouse?._id || input.warehouse))) throw new StockError('A warehouse is required', 400);
    if (!(quantity > 0)) throw new StockError('Quantity must be greater than zero', 400);

    const bucket: StockBucket = input.bucket || 'Available';
    if (input.direction === 'out') {
        const balance = await balanceOf(input.product, input.warehouse, bucket);
        if (quantity > balance) {
            throw new StockError(`Not enough ${bucket === 'Quarantine' ? 'quarantined ' : ''}stock: ${quantity} requested, ${Math.max(0, balance)} in this warehouse`, 409, { requested: quantity, available: Math.max(0, balance) });
        }
    }

    const unitCost = input.unitCost !== undefined ? Number(input.unitCost) || 0 : undefined;
    return StockMovement.create({
        product: oid(input.product),
        warehouse: oid(input.warehouse),
        movementType: input.type,
        stockStatus: bucket,
        quantityIn: input.direction === 'in' ? quantity : 0,
        quantityOut: input.direction === 'out' ? quantity : 0,
        unitCost,
        totalCost: unitCost !== undefined ? unitCost * quantity : undefined,
        referenceType: input.referenceType,
        referenceId: input.referenceId ? oid(input.referenceId) : undefined,
        referenceNo: input.referenceNo,
        reason: input.reason,
        remarks: input.remarks?.trim() || undefined,
        supplier: input.supplier ? oid(input.supplier) : undefined,
        lpoNo: input.lpoNo,
        reversalOf: input.reversalOf ? oid(input.reversalOf) : undefined,
        movementDate: input.movementDate || new Date(),
        createdBy: input.createdBy ? oid(input.createdBy) : undefined,
        createdDate: new Date(),
        isDeleted: false,
    });
};

/**
 * Cancels a document's stock effect by posting the opposite of every row it made. Rows already
 * reversed are skipped, so running it twice is harmless. Returns the number of rows reversed.
 */
export const reverseByReference = async (referenceType: string, referenceId: any, createdBy?: any, remarks?: string): Promise<number> => {
    const originals: any[] = await StockMovement.find({ ...notDeleted, referenceType, referenceId: oid(referenceId), reversalOf: { $exists: false } }).lean();
    if (!originals.length) return 0;
    const reversed = new Set((await StockMovement.find({ ...notDeleted, reversalOf: { $in: originals.map((o) => o._id) } }).select('reversalOf').lean()).map((r: any) => String(r.reversalOf)));
    let count = 0;
    for (const original of originals) {
        if (reversed.has(String(original._id))) continue;
        const wasIn = (original.quantityIn || 0) > 0;
        await post({
            product: original.product,
            warehouse: original.warehouse,
            type: original.movementType,
            direction: wasIn ? 'out' : 'in',
            quantity: wasIn ? original.quantityIn : original.quantityOut,
            bucket: original.stockStatus,
            unitCost: original.unitCost,
            referenceType,
            referenceId,
            referenceNo: original.referenceNo,
            reason: original.reason,
            remarks: remarks || 'Reversal',
            supplier: original.supplier,
            lpoNo: original.lpoNo,
            reversalOf: original._id,
            createdBy,
        });
        count++;
    }
    return count;
};

export interface Shortage {
    product: string;
    requested: number;
    available: number;
}

/**
 * Products the warehouse cannot deliver in full. A job's own reservation counts as free for that job,
 * because the delivery consumes it; stock reserved for anyone else does not.
 */
export const findDeliveryShortages = async (lines: { product: any; quantity: number }[], jobId?: any): Promise<Shortage[]> => {
    const wanted = new Map<string, number>();
    lines.forEach((l) => wanted.set(String(l.product?._id || l.product), (wanted.get(String(l.product?._id || l.product)) || 0) + (Number(l.quantity) || 0)));
    const ids = [...wanted.keys()];
    const [balances, reservedByOthers] = await Promise.all([getBalances(ids), getReservedQuantities(ids, undefined, jobId)]);
    const shortages: Shortage[] = [];
    wanted.forEach((requested, id) => {
        const free = Math.max(0, (balances.get(id)?.onHand || 0) - (reservedByOthers.get(id) || 0));
        if (requested > free) shortages.push({ product: id, requested, available: free });
    });
    return shortages;
};

/** Takes `quantity` of a job's reserved stock for a product; the reservation shrinks and closes at zero. */
export const consumeJobReservations = async (jobId: any, productId: any, quantity: number, employeeId?: any) => {
    let remaining = quantity;
    const reservations: any[] = await StockReservation.find({ ...getActiveReservationFilter(), job: oid(jobId), product: oid(productId) }).sort({ createdDate: 1 }).lean();
    for (const reservation of reservations) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, reservation.quantity);
        remaining -= take;
        const left = reservation.quantity - take;
        await StockReservation.updateOne(
            { _id: reservation._id, status: 'Active' },
            left > 0
                ? { $set: { quantity: left, updatedDate: new Date() } }
                : { $set: { status: 'Converted', releaseReason: 'Delivered', releasedAt: new Date(), releasedBy: employeeId, updatedDate: new Date() } }
        );
    }
};

/**
 * Posts the Delivery rows for a delivery note: takes each product from the warehouses holding it (largest
 * first), consumes the job's reservation, and refuses the whole delivery when any line is short.
 */
export const postDelivery = async (input: { lines: { product: any; quantity: number }[]; jobId?: any; referenceType: string; referenceId: any; referenceNo?: string; createdBy?: any; remarks?: string }) => {
    const lines = input.lines.filter((l) => l.product && Number(l.quantity) > 0);
    if (!lines.length) return;

    const shortages = await findDeliveryShortages(lines, input.jobId);
    if (shortages.length) throw new StockError('Not enough stock to deliver', 409, shortages);

    const totals = new Map<string, number>();
    lines.forEach((l) => totals.set(String(l.product?._id || l.product), (totals.get(String(l.product?._id || l.product)) || 0) + Number(l.quantity)));
    const costs = await getLastReceiptCosts([...totals.keys()]);

    for (const [productId, total] of totals) {
        const perWarehouse: any[] = await StockMovement.aggregate([
            { $match: { ...notDeleted, product: oid(productId), stockStatus: { $ne: 'Quarantine' }, warehouse: { $exists: true } } },
            { $group: { _id: '$warehouse', qty: { $sum: { $subtract: ['$quantityIn', '$quantityOut'] } } } },
            { $match: { qty: { $gt: 0 } } },
            { $sort: { qty: -1 } },
        ]);
        let remaining = total;
        for (const bucket of perWarehouse) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, bucket.qty);
            await post({
                product: productId,
                warehouse: bucket._id,
                type: 'Delivery',
                direction: 'out',
                quantity: take,
                unitCost: costs.get(productId)?.unitCost,
                referenceType: input.referenceType,
                referenceId: input.referenceId,
                referenceNo: input.referenceNo,
                remarks: input.remarks,
                createdBy: input.createdBy,
            });
            remaining -= take;
        }
        if (input.jobId) await consumeJobReservations(input.jobId, productId, total, input.createdBy);
    }
};

export interface ReserveInput {
    product: any;
    quantity: number;
    sourceType: 'Quotation' | 'Deal' | 'Job' | 'Manual';
    quote?: any;
    job?: any;
    customer?: any;
    warehouse?: any;
    expiresAt?: Date;
    createdBy?: any;
}

/**
 * Claims stock for a quote or job. Never blocked: a job may reserve goods that are still on order, and the
 * shortfall shows in the stock screens. Returns the reservation and how much of it is not yet covered.
 */
export const reserve = async (input: ReserveInput) => {
    const quantity = Number(input.quantity);
    if (!(quantity > 0)) throw new StockError('Quantity must be greater than zero', 400);
    const availability = (await getAvailability([input.product])).get(String(input.product?._id || input.product));
    const reservation = await StockReservation.create({
        product: oid(input.product),
        warehouse: input.warehouse ? oid(input.warehouse) : undefined,
        quote: input.quote ? oid(input.quote) : undefined,
        job: input.job ? oid(input.job) : undefined,
        customer: input.customer ? oid(input.customer) : undefined,
        sourceType: input.sourceType,
        sourceRef: oid(input.job || input.quote || input.product),
        quantity,
        reservedFrom: new Date(),
        expiresAt: input.expiresAt,
        status: 'Active',
        createdBy: input.createdBy,
        createdDate: new Date(),
        updatedDate: new Date(),
        isDeleted: false,
    });
    return { reservation, shortfall: Math.max(0, quantity - (availability?.available || 0)) };
};

/** Ends the active reservations that match, as Released (given back) or Converted (taken over by a job). */
export const release = async (
    filter: { quote?: any; job?: any; sourceType?: string; id?: any },
    reason: string,
    employeeId?: any,
    status: 'Released' | 'Converted' | 'Expired' = 'Released'
): Promise<number> => {
    const match: any = { status: 'Active', isDeleted: { $ne: true } };
    if (filter.id) match._id = oid(filter.id);
    if (filter.quote) match.quote = oid(filter.quote);
    if (filter.job) match.job = oid(filter.job);
    if (filter.sourceType) match.sourceType = filter.sourceType;
    if (!filter.id && !filter.quote && !filter.job) return 0;
    const result = await StockReservation.updateMany(match, {
        $set: { status, releaseReason: reason, releasedAt: new Date(), releasedBy: employeeId, updatedDate: new Date() },
    });
    return result.modifiedCount || 0;
};

/** Marks reservations whose period has ended as Expired. Availability already ignores them. */
export const expireLapsedReservations = async () => {
    try {
        await StockReservation.updateMany(
            { status: 'Active', isDeleted: { $ne: true }, expiresAt: { $lt: new Date() } },
            { $set: { status: 'Expired', releaseReason: 'Hold period ended', releasedAt: new Date(), updatedDate: new Date() } }
        );
    } catch (error) {
        console.error('Reservation expiry error:', error);
    }
};

/**
 * Quarantined stock that is free to release or write off: what sits in quarantine less what an open
 * supplier-return hold is still waiting to settle. Holds are matched by the movement they posted.
 */
export const getReleasableQuarantine = async (product: any, warehouse: any, heldQuantity: number): Promise<number> => {
    const quarantined = await balanceOf(product, warehouse, 'Quarantine');
    return Math.max(0, quarantined - heldQuantity);
};

export { balanceOf };
