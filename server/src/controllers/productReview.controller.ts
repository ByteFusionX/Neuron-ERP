import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import Product from "../models/products.model";
import Department from "../models/department.model";
import { getEmployeeData } from "../common/utils/util";
import { logAudit } from "../services/audit.service";
import { cleanAliases, derivedKeys, findDuplicates, normalizePartNo, brandKeyOf } from "../common/utils/productMatch";
import { auditProduct, getDepartmentCode, nextItemCode } from "./product.controller";

/** Duplicate lookup for the product form and pickers: `?partNo=&brand=&excludeId=`. */
export const checkDuplicate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { partNo, brand, excludeId } = req.query;
        const exclude = typeof excludeId === 'string' ? excludeId : undefined;
        const matches: any[] = typeof partNo === 'string' && normalizePartNo(partNo)
            ? await findDuplicates({ partNo, brand: typeof brand === 'string' ? brand : '', excludeId: exclude })
            : [];
        // Product names may repeat, so only the part number is checked.
        return res.status(200).json({ matches });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

/**
 * Creates a product that still needs review (from an RFQ line or an import). It is saved Pending, so it is
 * kept out of the pickers until a reviewer approves it. If the part number already exists, nothing is
 * created and the existing product is reported instead.
 */
const createPendingProduct = async (row: any, source: 'RFQ' | 'Import', employeeId: any) => {
    const partNo = String(row?.partNo ?? '').trim();
    const brand = String(row?.brand ?? '').trim();
    const description = String(row?.productDescription ?? row?.productName ?? '').trim();
    if (!description) return { status: 'invalid' as const, message: 'A description is required' };

    const { aliases, error: aliasError } = cleanAliases(row?.aliases);
    if (aliasError) return { status: 'invalid' as const, message: aliasError };

    if (partNo || aliases.length) {
        const duplicates = await findDuplicates({ partNo, brand, aliases });
        const blocking = duplicates.find((d) => d.level === 'block');
        if (blocking) return { status: 'duplicate' as const, message: blocking.reason, existing: blocking, matches: duplicates };
    }

    const segment = row?.productSegment && ObjectId.isValid(row.productSegment) ? await Department.findById(row.productSegment) : null;
    const itemCode = await nextItemCode(segment ? getDepartmentCode(segment.departmentName) : 'DEP');
    const product = await Product.create({
        partNo,
        ...derivedKeys(partNo, brand),
        aliases,
        brand,
        itemCode,
        productName: row?.productName?.toString().trim() || undefined,
        productDescription: description,
        productCategory: row?.productCategory && ObjectId.isValid(row.productCategory) ? row.productCategory : undefined,
        productSegment: segment ? segment._id : undefined,
        warehouse: row?.warehouse && ObjectId.isValid(row.warehouse) ? row.warehouse : undefined,
        unitOfMeasure: row?.unitOfMeasure?.toString().trim() || undefined,
        parentModel: row?.parentModel?.toString().trim() || undefined,
        isGeneric: row?.isGeneric === true,
        source,
        approvalStatus: 'Pending',
        isActive: true,
        createdBy: employeeId,
        createdDate: new Date(),
        updatedDate: new Date(),
        isDeleted: false,
    });
    const matches = partNo ? await findDuplicates({ partNo, brand, excludeId: String(product._id) }) : [];
    return { status: 'created' as const, product, matches };
};

/** One unknown item from an RFQ line. Body: `{ partNo?, brand?, productDescription, productName?, unitOfMeasure?, ... }`. */
export const quickCreateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const result = await createPendingProduct(req.body, 'RFQ', employee._id);
        if (result.status === 'invalid') return res.status(400).json({ message: result.message });
        if (result.status === 'duplicate') {
            return res.status(200).json({ created: false, message: `${result.message}. Using the existing product.`, product: result.existing, matches: result.matches });
        }
        await auditProduct(req, result.product, "created", `Product ${result.product.itemCode} added from an RFQ, waiting for review`);
        return res.status(201).json({ created: true, product: result.product, matches: result.matches });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

/**
 * Bulk import: `{ rows: [...], dryRun?: boolean }`. Each row gets the same duplicate check as the form.
 * Rows are saved Pending with source "Import". With dryRun nothing is saved, so the user sees the verdicts first.
 */
export const importProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
        if (!rows.length) return res.status(400).json({ message: "No rows to import" });
        if (rows.length > 1000) return res.status(400).json({ message: "Import at most 1000 rows at a time" });
        const dryRun = req.body?.dryRun === true;

        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        // Rows in one file can duplicate each other, which the database can't see until they are saved.
        const seen = new Map<string, number>();
        const results: any[] = [];
        let created = 0;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const norm = normalizePartNo(row?.partNo);
            const key = `${brandKeyOf(row?.brand)}|${norm}`;
            if (norm && seen.has(key)) {
                results.push({ row: i + 1, status: 'duplicate', message: `Same as row ${seen.get(key)} in this file` });
                continue;
            }
            if (norm) seen.set(key, i + 1);

            if (dryRun) {
                const description = String(row?.productDescription ?? row?.productName ?? '').trim();
                if (!description) { results.push({ row: i + 1, status: 'invalid', message: 'A description is required' }); continue; }
                const dup = norm
                    ? (await findDuplicates({ partNo: row.partNo, brand: row.brand, aliases: cleanAliases(row.aliases).aliases })).find((d) => d.level === 'block')
                    : undefined;
                results.push(dup ? { row: i + 1, status: 'duplicate', message: dup.reason, existing: dup } : { row: i + 1, status: 'ok' });
                continue;
            }

            const result = await createPendingProduct(row, 'Import', employee._id);
            if (result.status === 'created') {
                created++;
                results.push({ row: i + 1, status: 'created', itemCode: result.product.itemCode });
            } else {
                results.push({ row: i + 1, status: result.status, message: result.message, existing: (result as any).existing });
            }
        }

        if (created) {
            await logAudit(req, { entityType: "product", entityId: employee._id, entityLabel: "Product import", action: "imported", summary: `Imported ${created} product(s), waiting for review` });
        }
        return res.status(200).json({
            dryRun,
            created,
            duplicates: results.filter((r) => r.status === 'duplicate').length,
            invalid: results.filter((r) => r.status === 'invalid').length,
            results,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

/**
 * Products that may be the same item entered twice: the same normalised part number (same brand or not), or
 * the same brand with identical description wording.
 */
export const getDuplicatesReport = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const live = { isDeleted: { $ne: true } };
        // Inside $push these are expressions, so each field must be a "$field" reference, not 1.
        const project = Object.fromEntries(['_id', 'itemCode', 'partNo', 'brand', 'productDescription', 'approvalStatus', 'source'].map((f) => [f, `$${f}`]));
        const [sameNumber, sameDescription, unmigrated] = await Promise.all([
            Product.aggregate([
                { $match: { ...live, partNoNormalized: { $exists: true, $ne: '' } } },
                { $group: { _id: '$partNoNormalized', count: { $sum: 1 }, brands: { $addToSet: '$brandKey' }, products: { $push: project } } },
                { $match: { count: { $gt: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 200 },
            ]),
            Product.aggregate([
                { $match: { ...live, productDescription: { $type: 'string' } } },
                { $group: { _id: { brand: '$brandKey', desc: { $trim: { input: { $toLower: '$productDescription' } } } }, count: { $sum: 1 }, products: { $push: project } } },
                { $match: { count: { $gt: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 200 },
            ]),
            Product.countDocuments({ ...live, partNoNormalized: { $exists: false } }),
        ]);
        return res.status(200).json({
            unmigrated,
            samePartNumber: sameNumber.map((g: any) => ({ key: g._id, sameBrand: g.brands.length === 1, count: g.count, products: g.products })),
            sameDescription: sameDescription.map((g: any) => ({ brand: g._id.brand, description: g._id.desc, count: g.count, products: g.products })),
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};
