import { Types } from "mongoose";
import SupplierPriceModel, { SupplierPriceSource } from "../models/supplierPrice.model";

export interface SupplierPriceInput {
    supplierId: any;
    productId: any;
    price: number;
}

const validId = (id: any) => !!id && Types.ObjectId.isValid(String(id?._id ?? id));
const idOf = (id: any) => new Types.ObjectId(String(id?._id ?? id));

/**
 * Keeps each supplier's last price per product. A PO price always replaces the row; a PR (comparison) price
 * never replaces a PO price, so the suggestion is the last PO price when there is one.
 * Never throws: a failed write must not fail the save that triggered it.
 */
export const recordPrices = async (
    rows: SupplierPriceInput[],
    source: SupplierPriceSource,
    ref: { currency?: string; sourceNo?: string; sourceId?: any; employeeId?: any }
) => {
    try {
        const currency = String(ref.currency || 'QAR').toUpperCase();
        // One price per supplier and product; the last row given wins.
        const byKey = new Map<string, SupplierPriceInput>();
        rows.forEach((row) => {
            if (!validId(row.supplierId) || !validId(row.productId) || !(Number(row.price) > 0)) return;
            byKey.set(`${String(row.supplierId?._id ?? row.supplierId)}|${String(row.productId?._id ?? row.productId)}`, row);
        });
        if (!byKey.size) return;

        const existing = await SupplierPriceModel.find({
            currency,
            $or: [...byKey.values()].map((row) => ({ supplierId: idOf(row.supplierId), productId: idOf(row.productId) })),
        }).lean();
        const current = new Map(existing.map((e: any) => [`${String(e.supplierId)}|${String(e.productId)}`, e]));

        const now = new Date();
        const ops: any[] = [];
        byKey.forEach((row, key) => {
            const had: any = current.get(key);
            if (source === SupplierPriceSource.PR && had?.source === SupplierPriceSource.PO) return;
            const price = Number(row.price);
            ops.push({
                updateOne: {
                    filter: { supplierId: idOf(row.supplierId), productId: idOf(row.productId), currency },
                    update: {
                        $set: {
                            lastPrice: price,
                            lastDate: now,
                            source,
                            sourceNo: ref.sourceNo,
                            sourceId: validId(ref.sourceId) ? idOf(ref.sourceId) : undefined,
                            updatedBy: validId(ref.employeeId) ? idOf(ref.employeeId) : undefined,
                            ...(had && Number(had.lastPrice) !== price ? { previousPrice: Number(had.lastPrice) } : {}),
                        },
                    },
                    upsert: true,
                },
            });
        });
        if (ops.length) await SupplierPriceModel.bulkWrite(ops, { ordered: false });
    } catch (error) {
        console.error('Failed to record supplier prices:', error);
    }
};

/** The last prices for these products, optionally narrowed to some suppliers and one currency. */
export const findPrices = async (productIds: any[], supplierIds: any[] = [], currency?: string) => {
    const products = productIds.filter(validId).map(idOf);
    if (!products.length) return [];
    const suppliers = supplierIds.filter(validId).map(idOf);
    return SupplierPriceModel.find({
        productId: { $in: products },
        ...(suppliers.length ? { supplierId: { $in: suppliers } } : {}),
        ...(currency ? { currency: String(currency).toUpperCase() } : {}),
    }).select('supplierId productId currency lastPrice lastDate source sourceNo previousPrice').lean();
};
