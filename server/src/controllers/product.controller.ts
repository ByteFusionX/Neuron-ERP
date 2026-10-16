import { Request, Response, NextFunction } from "express";
import Product from "../models/products.model";
import Supplier from "../models/supplier.model";
import Department from "../models/department.model";
import ProductCategory from "../models/productCategory.model";
import Warehouse from "../models/warehouse.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { ObjectId } from "mongodb";
import Employee from "../models/employee.model";
import Quotation from "../models/quotation.model";
import Rfq from "../models/rfq.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import StockMovement from "../models/stockMovement.model";
import Item from "../models/item.model";
import { logAudit } from "../services/audit.service";
import { cleanAliases, derivedKeys, findDuplicates, normalizePartNo, brandKeyOf } from "../common/utils/productMatch";
import { PRODUCT_SOURCES, PRODUCT_TYPES } from "../models/products.model";

export const auditProduct = (req: Request, product: any, action: string, summary: string, changes?: { label: string; from?: string; to?: string }[]) =>
    logAudit(req, { entityType: "product", entityId: product._id, entityLabel: product.itemCode, action, summary, changes });

const AUDITED_FIELDS: { label: string; get: (p: any) => unknown }[] = [
    { label: "Item code", get: (p) => p.itemCode },
    { label: "Part no", get: (p) => p.partNo },
    { label: "Product name", get: (p) => p.productName },
    { label: "Description", get: (p) => p.productDescription },
    { label: "Category", get: (p) => p.productCategory?.categoryName },
    { label: "Segment", get: (p) => p.productSegment?.departmentName },
    { label: "Warehouse", get: (p) => p.warehouse?.wareHouseName },
    { label: "Brand", get: (p) => p.brand },
    { label: "Type", get: (p) => p.type },
    { label: "Unit of measure", get: (p) => p.unitOfMeasure },
    { label: "Tax rate", get: (p) => p.defaultTaxRate },
    { label: "Selling price", get: (p) => p.defaultSellingPrice },
    { label: "Estimated cost", get: (p) => p.estimatedCost },
    { label: "Status", get: (p) => (p.isActive === false ? "Inactive" : "Active") },
];

const diffProduct = (before: any, after: any) => {
    const text = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));
    return AUDITED_FIELDS
        .map(({ label, get }) => ({ label, from: text(get(before)), to: text(get(after)) }))
        .filter((c) => c.from !== c.to);
};
/** Legacy records have no approvalStatus; treat anything not Draft/Pending as usable. */
export const APPROVED_PRODUCT_FILTER = { approvalStatus: { $nin: ['Draft', 'Pending'] } };

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "ab 123" should also find AB-123: match the normalised part number and alias keys too. */
const normalizedSearchClauses = (term: string): any[] => {
    const norm = normalizePartNo(term);
    if (norm.length < 2) return [];
    const re = new RegExp(escapeRegex(norm), 'i');
    return [{ partNoNormalized: re }, { 'aliases.valueNormalized': re }];
};

/** Prices and cost must be real non-negative amounts; tax is a percentage. Unset values are allowed. */
const unset = (v: unknown) => v === undefined || v === null || v === '';
const validateMoney = (data: any): string | null => {
    const checks: [string, unknown, number][] = [
        ['Default selling price', data.defaultSellingPrice, 1e12],
        ['Estimated cost', data.estimatedCost, 1e12],
        ['Tax rate', data.defaultTaxRate, 100],
    ];
    for (const [label, value, max] of checks) {
        if (unset(value)) continue;
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n) || n < 0 || n > max) {
            return `${label} must be a number between 0 and ${max === 100 ? '100' : '1,000,000,000,000'}`;
        }
    }
    return null;
};

/** Length and enum limits so a direct API call can't store a 5,000-character name or an unknown type. */
const validateText = (data: any, creating: boolean): string | null => {
    const limits: [string, unknown, number][] = [
        ['Product name', data.productName, 200],
        ['Description', data.productDescription, 2000],
        ['Part number', data.partNo, 100],
        ['Brand', data.brand, 100],
        ['Unit', data.unitOfMeasure, 40],
        ['Model / family', data.parentModel, 100],
    ];
    for (const [label, value, max] of limits) {
        if (typeof value === 'string' && value.trim().length > max) return `${label} must be ${max} characters or fewer`;
    }
    const validType = (PRODUCT_TYPES as readonly string[]).includes(data.type);
    if (creating ? !validType : (data.type !== undefined && data.type !== '' && !validType)) return 'Type must be Stock or Non-Stock';
    if (creating && (typeof data.productName !== 'string' || !data.productName.trim())) return 'Product name is required';
    if (typeof data.productDescription === 'string' && !data.productDescription.trim()) return 'Description is required';
    return null;
};

const TEXT_FILTER_FIELDS = ['partNo', 'itemCode', 'productName', 'productDescription', 'brand', 'unitOfMeasure'];
const REF_FILTER_FIELDS = ['productCategory', 'productSegment', 'warehouse'];

/** Operators beyond contains/is: "is not", "does not contain", "is empty" and number comparisons. */
const buildAdvancedFilters = (raw: unknown): any[] => {
    if (typeof raw !== 'string' || !raw) return [];
    let list: any;
    try { list = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(list)) return [];

    const conds: any[] = [];
    for (const f of list.slice(0, 20)) {
        const { key, op } = f ?? {};
        const value = typeof f?.value === 'string' ? f.value.trim() : f?.value;
        if (typeof key !== 'string' || typeof op !== 'string') continue;

        if (TEXT_FILTER_FIELDS.includes(key)) {
            if (op === 'empty') conds.push({ $or: [{ [key]: { $exists: false } }, { [key]: null }, { [key]: '' }] });
            else if (op === 'notContains' && value) conds.push({ [key]: { $not: new RegExp(escapeRegex(String(value)), 'i') } });
            else if (op === 'isNot' && value) conds.push({ [key]: { $not: new RegExp(`^${escapeRegex(String(value))}$`, 'i') } });
        } else if (REF_FILTER_FIELDS.includes(key) && op === 'isNot' && ObjectId.isValid(String(value))) {
            conds.push({ [key]: { $ne: new ObjectId(String(value)) } });
        } else if (key === 'type' && op === 'isNot' && value) {
            conds.push({ type: { $ne: String(value) } });
        } else if (key === 'isActive' && op === 'isNot') {
            conds.push({ isActive: value === 'Active' ? false : true });
        } else if (key === 'approvalStatus' && op === 'isNot') {
            if (value === 'Approved') conds.push({ approvalStatus: { $in: ['Draft', 'Pending'] } });
            else if (value === 'Pending' || value === 'Draft') conds.push({ approvalStatus: { $ne: value } });
        } else if (key === 'defaultSellingPrice') {
            const n = Number(value);
            if (op === 'empty') conds.push({ $or: [{ defaultSellingPrice: { $exists: false } }, { defaultSellingPrice: null }] });
            else if (!unset(value) && Number.isFinite(n)) {
                if (op === 'eq') conds.push({ defaultSellingPrice: n });
                else if (op === 'gt') conds.push({ defaultSellingPrice: { $gt: n } });
                else if (op === 'lt') conds.push({ defaultSellingPrice: { $lt: n } });
            }
        }
    }
    return conds;
};

const isAdminRole =(employee: any): boolean => ['admin'].includes(employee?.category?.role) || /^superadmin$/i.test(String(employee?.category?.role ?? ''));

export const getDepartmentCode = (departmentName?: string): string => {
    const words = (departmentName || '').trim().split(/\s+/).filter(Boolean);

    if (words.length >= 3) {
        return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase();
    }

    if (words.length === 2) {
        const [first, second] = words;
        const code = first.slice(0, 2) + second.slice(0, 1);
        return code.toUpperCase();
    }

    if (words.length === 1) {
        return words[0].slice(0, 3).toUpperCase();
    }

    return 'DEP';
};

export const nextItemCode = async (deptCode: string, skip = 0): Promise<string> => {
    const pattern = /^NR-ITM-[A-Z]+-(\d+)$/i;
    const products = await Product.find({ itemCode: { $regex: pattern } }).select('itemCode').lean();

    let maxNum = 0;
    for (const product of products) {
        const match = (product.itemCode || '').match(pattern);
        if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
    }

    return `NR-ITM-${deptCode}-${(maxNum + 1 + skip).toString().padStart(4, '0')}`;
};

export const generateItemCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { departmentId } = req.query;
        let deptCode = 'DEP';

        if (departmentId) {
            if (!ObjectId.isValid(departmentId as string)) {
                return res.status(400).json({ message: "Invalid departmentId" });
            }
            const department = await Department.findById(departmentId);
            if (!department) {
                return res.status(404).json({ message: "Department not found" });
            }
            deptCode = getDepartmentCode(department.departmentName);
        }

        const itemCode = await nextItemCode(deptCode);

        return res.status(200).json({ success: true, itemCode });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        const blank = (v: unknown) => typeof v !== 'string' || !v.trim();
        const isGeneric = data.isGeneric === true;
        if ((!isGeneric && (blank(data.partNo) || blank(data.brand))) || blank(data.itemCode) || blank(data.productDescription) || !data.productCategory || !data.productSegment) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const partNo = typeof data.partNo === 'string' ? data.partNo.trim() : '';
        const brand = typeof data.brand === 'string' ? data.brand.trim() : '';
        const { aliases, error: aliasError } = cleanAliases(data.aliases);
        if (aliasError) return res.status(400).json({ message: aliasError });
        if (data.source !== undefined && !(PRODUCT_SOURCES as readonly string[]).includes(data.source)) {
            return res.status(400).json({ message: "Invalid product source" });
        }

        const moneyError = validateMoney(data) ?? validateText(data, true);
        if (moneyError) return res.status(400).json({ message: moneyError });

        // Ensure refs are valid ObjectIds
        const refIds = [data.productCategory, data.productSegment, ...(data.warehouse ? [data.warehouse] : [])];
        if (!refIds.every((id: string) => ObjectId.isValid(id))) {
            return res.status(400).json({ message: "Invalid reference id(s) provided" });
        }

        // Same brand + same part number (ignoring case, spaces and dashes), or an alias already taken.
        const duplicates = await findDuplicates({ partNo, brand, aliases });
        const blocking = duplicates.find((d) => d.level === 'block');
        if (blocking) {
            return res.status(409).json({ message: `${blocking.reason}. Use the existing product instead.`, matches: duplicates });
        }

        // Uniqueness check on itemCode (case-insensitive)
        // Two people creating at once can be handed the same generated code: give the later one the next free code.
        let itemCode = data.itemCode.trim();
        const codeTaken = (code: string) => Product.exists({ itemCode: new RegExp(`^${escapeRegex(code)}$`, 'i'), isDeleted: { $ne: true } });
        if (await codeTaken(itemCode)) {
            const dept = itemCode.match(/^NR-ITM-([A-Z]+)-\d+$/i)?.[1]?.toUpperCase();
            if (!dept) return res.status(409).json({ message: "Product with this item code already exists" });
            let next = await nextItemCode(dept);
            for (let i = 1; i < 10 && await codeTaken(next); i++) next = await nextItemCode(dept, i);
            itemCode = next;
        }

        // Validate referenced docs exist
        const [categoryExist, segmentExist, warehouseExist] = await Promise.all([
            ProductCategory.findById(data.productCategory),
            Department.findById(data.productSegment),
            data.warehouse ? Warehouse.findById(data.warehouse) : Promise.resolve(true)
        ]);
        if (!categoryExist || !segmentExist || !warehouseExist) {
            return res.status(400).json({ message: "Invalid references provided" });
        }

        const employee = await getEmployeeData(token);
        if (!employee) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const product = await Product.create({
            partNo,
            ...derivedKeys(partNo, brand),
            aliases,
            source: data.source ?? 'Manual',
            parentModel: typeof data.parentModel === 'string' && data.parentModel.trim() ? data.parentModel.trim() : undefined,
            nickName: typeof data.nickName === 'string' && data.nickName.trim() ? data.nickName.trim() : undefined,
            isGeneric,
            itemCode,
            productName: data.productName?.trim(),
            productDescription: data.productDescription.trim(),
            productCategory: data.productCategory,
            productSegment: data.productSegment,
            warehouse: data.warehouse || undefined,
            brand,
            type: data.type,
            unitOfMeasure: data.unitOfMeasure?.trim(),
            defaultTaxRate: data.defaultTaxRate,
            defaultSellingPrice: data.defaultSellingPrice,
            estimatedCost: data.estimatedCost,
            isActive: data.isActive ?? true,
            // Approval is switched off for now: every new item is saved as Approved. Re-enable by restoring the
            // non-admin 'Pending' branch (the approve/reject endpoints are still in place).
            approvalStatus: 'Approved',
            approvedBy: employee._id,
            approvedDate: new Date(),
            createdBy: employee._id,
            createdDate: data.createdDate ?? new Date(),
            updatedDate: new Date(),
            isDeleted: false
        });

        const populated = await Product.findById(product._id)
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .populate('createdBy', 'firstName lastName');

        await auditProduct(req, product, "created", `Product ${product.itemCode} created`);
        return res.status(201).json(populated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            page = '1',
            row = '10',
            search,
            partNo,
            itemCode,
            productName,
            productDescription,
            type,
            productCategory,
            productSegment,
            warehouse,
            brand,
            unitOfMeasure,
            defaultSellingPrice,
            isActive,
            approvalStatus,
            source,
            parentModel,
            createdBy,
            sortBy,
            sortDir,
            advFilters
        } = req.query;

        const tokenData = (req as any).user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.inventory?.products?.viewReport
            ? await buildPrivilegeAccessFilter(employee._id, privileges.inventory.products.viewReport, 'createdBy')
            : {};

        const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
        const rowNum = Math.min(Math.max(parseInt(row as string, 10) || 10, 1), 10000);
        const skip = (pageNum - 1) * rowNum;

        const filter: any = {
            isDeleted: { $ne: true },
            ...accessFilter
        };

        if (partNo) {
            filter.partNo = { $regex: partNo as string, $options: 'i' };
        }

        if (itemCode) {
            filter.itemCode = { $regex: itemCode as string, $options: 'i' };
        }

        if (productName) {
            filter.productName = { $regex: productName as string, $options: 'i' };
        }

        if (productDescription) {
            filter.productDescription = { $regex: productDescription as string, $options: 'i' };
        }

        if (type) {
            filter.type = type as string;
        }

        if (unitOfMeasure) {
            filter.unitOfMeasure = { $regex: unitOfMeasure as string, $options: 'i' };
        }

        if (defaultSellingPrice !== undefined && defaultSellingPrice !== '') {
            const priceNum = Number(defaultSellingPrice);
            if (!Number.isNaN(priceNum)) {
                filter.defaultSellingPrice = priceNum;
            }
        }

        if (isActive === 'true' || isActive === 'false') {
            filter.isActive = isActive === 'true';
        }

        if (typeof source === 'string' && (PRODUCT_SOURCES as readonly string[]).includes(source)) {
            filter.source = source;
        }

        if (typeof parentModel === 'string' && parentModel.trim()) {
            filter.parentModel = new RegExp(`^${escapeRegex(parentModel.trim())}$`, 'i');
        }

        if (approvalStatus === 'Pending' || approvalStatus === 'Draft') {
            filter.approvalStatus = approvalStatus;
        } else if (approvalStatus === 'Approved') {
            Object.assign(filter, APPROVED_PRODUCT_FILTER);
        }

        if (productCategory && ObjectId.isValid(productCategory as string)) {
            filter.productCategory = new ObjectId(productCategory as string);
        }

        if (productSegment && ObjectId.isValid(productSegment as string)) {
            filter.productSegment = new ObjectId(productSegment as string);
        }

        if (warehouse && ObjectId.isValid(warehouse as string)) {
            filter.warehouse = new ObjectId(warehouse as string);
        }

        if (brand) {
            filter.brand = { $regex: brand as string, $options: 'i' };
        }

        const searchTerm = typeof search === 'string' ? search.trim() : '';
        if (searchTerm) {
            const regex = new RegExp(escapeRegex(searchTerm), 'i');
            filter.$or = [
                { partNo: regex },
                { 'aliases.value': regex },
                ...normalizedSearchClauses(searchTerm),
                { parentModel: regex },
                { nickName: regex },
                { itemCode: regex },
                { productName: regex },
                { productDescription: regex },
                { brand: regex }
            ];
        }

        const advanced = buildAdvancedFilters(advFilters);
        if (advanced.length) filter.$and = advanced;

        if (createdBy && typeof createdBy === 'string') {
            if (ObjectId.isValid(createdBy)) {
                filter.createdBy = new ObjectId(createdBy);
            } else {
                const employeeMatches = await Employee.find({
                    $or: [
                        { firstName: { $regex: createdBy, $options: 'i' } },
                        { lastName: { $regex: createdBy, $options: 'i' } }
                    ]
                }).select('_id');

                if (!employeeMatches.length) {
                    return res.status(200).json({
                        success: true,
                        message: 'Products fetched successfully',
                        data: {
                            products: [],
                            pagination: {
                                total: 0,
                                page: pageNum,
                                pages: 0,
                                limit: rowNum
                            }
                        }
                    });
                }

                filter.createdBy = { $in: employeeMatches.map(emp => emp._id) };
            }
        }

        // Whitelisted columns only; ties fall back to newest-first so paging stays stable.
        const sortableFields = ['itemCode', 'partNo', 'productName', 'type'];
        const sortSpec: Record<string, 1 | -1> = typeof sortBy === 'string' && sortableFields.includes(sortBy)
            ? { [sortBy]: sortDir === 'desc' ? -1 : 1, createdDate: -1 }
            : { createdDate: -1 };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate('productCategory')
                .populate('productSegment')
                .populate('warehouse')
                .populate('createdBy', 'firstName lastName')
                .sort(sortSpec)
                .collation({ locale: 'en', strength: 2 })
                .skip(skip)
                .limit(rowNum),
            Product.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            message: 'Products fetched successfully',
            data: {
                products,
                pagination: {
                    total,
                    page: pageNum,
                    pages: Math.ceil(total / rowNum),
                    limit: rowNum
                }
            }
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .populate('createdBy', 'firstName lastName');
        if (!product) return res.status(404).json({ message: "Product not found" });
        return res.status(200).json(product);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

/** Suppliers that list this product (matched by name, as supplier products are free text) plus its default vendor. */
export const getProductSuppliers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).select('productName defaultVendor');
        if (!product) return res.status(404).json({ message: "Product not found" });

        const escaped = String(product.productName ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const or: any[] = [];
        if (escaped) or.push({ products: { $elemMatch: { productName: new RegExp(`^${escaped}$`, 'i') } } });
        if (product.defaultVendor) or.push({ _id: product.defaultVendor });
        if (!or.length) return res.status(200).json([]);

        const suppliers = await Supplier.find({ isDeleted: { $ne: true }, $or: or })
            .select('supplierId supplierName status supplierType contactDetails creditDays products')
            .sort({ supplierName: 1 })
            .lean();

        const defaultId = product.defaultVendor ? String(product.defaultVendor) : '';
        return res.status(200).json(suppliers.map((s: any) => {
            const match = (s.products ?? []).find((p: any) => String(p.productName ?? '').trim().toLowerCase() === String(product.productName ?? '').trim().toLowerCase());
            return {
                _id: s._id,
                supplierId: s.supplierId,
                supplierName: s.supplierName,
                status: s.status,
                supplierType: s.supplierType,
                contactName: match?.contactName || s.contactDetails?.name,
                contactEmail: match?.contactEmail || s.contactDetails?.email,
                contactNo: match?.contactNo || s.contactDetails?.phoneNumber,
                paymentTerm: match?.paymentTerm,
                isDefault: String(s._id) === defaultId,
            };
        }));
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        const token = (req as any).user;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const moneyError = validateMoney(data) ?? validateText(data, false);
        if (moneyError) return res.status(400).json({ message: moneyError });

        const current: any = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).select('partNo partNoNormalized brand aliases isGeneric').lean();
        if (!current) return res.status(404).json({ message: "Product not found" });

        const nextPartNo = typeof data.partNo === 'string' ? data.partNo.trim() : (current.partNo ?? '');
        const nextBrand = typeof data.brand === 'string' ? data.brand.trim() : (current.brand ?? '');
        const nextGeneric = data.isGeneric !== undefined ? data.isGeneric === true : current.isGeneric === true;
        if (!nextGeneric && (!nextPartNo || !nextBrand)) return res.status(400).json({ message: "Part number and brand are required unless the item is generic" });

        let aliasList: any[] | undefined;
        if (data.aliases !== undefined) {
            const cleaned = cleanAliases(data.aliases);
            if (cleaned.error) return res.status(400).json({ message: cleaned.error });
            aliasList = cleaned.aliases;
        }
        // A replaced part number stays searchable (GRNs and delivery notes only hold it as text).
        const partNoChanged = normalizePartNo(nextPartNo) !== normalizePartNo(current.partNo) && !!current.partNo;
        if (partNoChanged) {
            const base = aliasList ?? (current.aliases ?? []);
            const oldNorm = normalizePartNo(current.partNo);
            if (!base.some((a: any) => a.valueNormalized === oldNorm && a.type === 'Superseded')) {
                aliasList = [...base, { value: current.partNo, valueNormalized: oldNorm, type: 'Superseded', note: 'Replaced part number' }];
            }
        }

        const keysChanged = nextPartNo !== (current.partNo ?? '') || nextBrand !== (current.brand ?? '') || aliasList !== undefined;
        if (keysChanged) {
            const duplicates = await findDuplicates({ partNo: nextPartNo, brand: nextBrand, aliases: aliasList, excludeId: id });
            const blocking = duplicates.find((d) => d.level === 'block');
            if (blocking) return res.status(409).json({ message: `${blocking.reason}. Use the existing product instead.`, matches: duplicates });
        }

        if (data.itemCode) {
            const existItemCode = await Product.findOne({ _id: { $ne: id }, itemCode: new RegExp(`^${escapeRegex(data.itemCode.trim())}$`, 'i'), isDeleted: { $ne: true } });
            if (existItemCode) return res.status(409).json({ message: "Product with this item code already exists" });
        }

        // Validate refs when supplied
        const refChecks: Promise<any>[] = [];
        if (data.productCategory) refChecks.push(ProductCategory.findById(data.productCategory));
        if (data.productSegment) refChecks.push(Department.findById(data.productSegment));
        if (data.warehouse) refChecks.push(Warehouse.findById(data.warehouse));
        if (refChecks.length) {
            const checks = await Promise.all(refChecks);
            if (checks.some((c) => !c)) return res.status(400).json({ message: "Invalid references provided" });
        }

        const employee = await getEmployeeData(token);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        // Approval is switched off for now: an edit never sends an item back for approval, and any item
        // that is still Pending/Rejected from before becomes Approved when it is edited. Products waiting in the
        // review queue (from an RFQ or an import) stay Pending: only the Approve action releases them.
        const needsReapproval = false;
        const rejected = !!(await Product.exists({
            _id: id, isDeleted: { $ne: true },
            $or: [{ approvalStatus: 'Draft' }, { approvalStatus: 'Pending', source: { $nin: ['RFQ', 'Import'] } }],
        }));

        const before = await Product.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate("productCategory").populate("productSegment").populate("warehouse").lean();

        const updated = await Product.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            {
                $set: {
                    ...(data.partNo !== undefined ? { partNo: nextPartNo } : {}),
                    ...(keysChanged || current.partNoNormalized === undefined ? derivedKeys(nextPartNo, nextBrand) : {}),
                    ...(aliasList !== undefined ? { aliases: aliasList } : {}),
                    ...(data.parentModel !== undefined ? { parentModel: String(data.parentModel ?? '').trim() } : {}),
                    ...(data.nickName !== undefined ? { nickName: String(data.nickName ?? '').trim() } : {}),
                    ...(data.isGeneric !== undefined ? { isGeneric: nextGeneric } : {}),
                    ...(data.itemCode ? { itemCode: data.itemCode.trim() } : {}),
                    ...(data.productDescription?.trim() ? { productDescription: data.productDescription.trim() } : {}),
                    ...(data.productCategory ? { productCategory: data.productCategory } : {}),
                    ...(data.productSegment ? { productSegment: data.productSegment } : {}),
                    ...(data.warehouse ? { warehouse: data.warehouse } : {}),
                    ...(data.brand !== undefined ? { brand: nextBrand } : {}),
                    ...(data.productName !== undefined ? { productName: data.productName?.trim() } : {}),
                    ...(data.type ? { type: data.type } : {}),
                    ...(data.unitOfMeasure !== undefined ? { unitOfMeasure: data.unitOfMeasure?.trim() } : {}),
                    ...(data.defaultTaxRate !== undefined ? { defaultTaxRate: data.defaultTaxRate } : {}),
                    ...(data.defaultSellingPrice !== undefined ? { defaultSellingPrice: data.defaultSellingPrice } : {}),
                    ...(data.estimatedCost !== undefined ? { estimatedCost: data.estimatedCost } : {}),
                    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                    ...(needsReapproval ? { approvalStatus: 'Pending' } : {}),
                    ...(rejected ? { approvalStatus: 'Approved', approvedBy: employee._id, approvedDate: new Date() } : {}),
                    updatedBy: employee._id,
                    updatedDate: new Date()
                },
                ...(needsReapproval ? { $unset: { approvedBy: '', approvedDate: '', rejectionReason: '' } } : {}),
                ...(rejected ? { $unset: { rejectionReason: '' } } : {})
            },
            { new: true }
        )
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .populate('createdBy', 'firstName lastName');

        if (!updated) return res.status(404).json({ message: "Product not found" });
        const changes = before ? diffProduct(before, updated) : [];
        if (changes.length) await auditProduct(req, updated, "updated", `Updated ${changes.map((c) => c.label.toLowerCase()).join(", ")}`, changes);
        if (needsReapproval && before?.approvalStatus !== "Pending") await auditProduct(req, updated, "resubmitted", "Sent back for approval after an edit");
        if (rejected) await auditProduct(req, updated, "approved", "Approved on edit (approval is switched off)");
        return res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const approveProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const pending: any = await Product.findOne({ _id: id, isDeleted: { $ne: true }, approvalStatus: 'Pending' }).lean();
        if (pending) {
            const missing = [
                !pending.isGeneric && !pending.partNo && 'part number',
                !pending.isGeneric && !pending.brand && 'brand',
                !pending.productCategory && 'category',
                !pending.productSegment && 'department',
            ].filter(Boolean);
            if (missing.length) return res.status(409).json({ message: `Complete the ${missing.join(', ')} before approving this product.` });
            const duplicates = await findDuplicates({ partNo: pending.partNo, brand: pending.brand, aliases: pending.aliases, excludeId: id });
            const blocking = duplicates.find((d) => d.level === 'block');
            if (blocking) return res.status(409).json({ message: `${blocking.reason}. Reject this one and use the existing product.`, matches: duplicates });
        }

        const product = await Product.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, approvalStatus: 'Pending' },
            { $set: { approvalStatus: 'Approved', approvedBy: employee._id, approvedDate: new Date() }, $unset: { rejectionReason: '' } },
            { new: true }
        );
        if (!product) return res.status(409).json({ message: "Only a pending product can be approved" });
        await auditProduct(req, product, "approved", "Product approved");
        return res.status(200).json(product);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const rejectProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        if (!reason) return res.status(400).json({ message: "A reason is required to reject a product" });

        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const product = await Product.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true }, approvalStatus: 'Pending' },
            { $set: { approvalStatus: 'Draft', rejectionReason: reason, updatedBy: employee._id, updatedDate: new Date() }, $unset: { approvedBy: '', approvedDate: '' } },
            { new: true }
        );
        if (!product) return res.status(409).json({ message: "Only a pending product can be rejected" });
        await auditProduct(req, product, "rejected", `Product rejected: ${reason}`);
        return res.status(200).json(product);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const live = { isDeleted: { $ne: true } };
        const [quotes, rfqs, orders, stock, items] = await Promise.all([
            Quotation.countDocuments({ ...live, 'itemDetails.productId': id }),
            Rfq.countDocuments({ ...live, 'requestedLines.partNo': id }),
            PurchaseOrder.countDocuments({ ...live, 'items.partNo': id }),
            StockMovement.countDocuments({ ...live, product: id }),
            Item.countDocuments({ partNo: id }),
        ]);
        const used = ([[quotes, 'quotation'], [rfqs, 'RFQ'], [orders, 'purchase order'], [stock, 'stock movement'], [items, 'inventory item']] as [number, string][])
            .filter(([n]) => n > 0)
            .map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`);
        if (used.length) {
            return res.status(409).json({ message: `This product is used in ${used.join(', ')} and can't be deleted. Mark it Inactive instead.` });
        }

        const deleted = await Product.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $set: { isDeleted: true } }, { new: true });
        if (!deleted) return res.status(404).json({ message: "Product not found or already deleted" });
        await auditProduct(req, deleted, "deleted", "Product deleted");
        return res.status(200).json({ success: true, message: "Product deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProductPartNumbers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { search = '', limit = '25' } = req.query;
        const filter: any = { isDeleted: { $ne: true }, ...APPROVED_PRODUCT_FILTER };

        if (typeof search === 'string' && search.trim()) {
            const regex = new RegExp(escapeRegex(search.trim()), 'i');
            filter.$or = [
                { partNo: regex },
                { 'aliases.value': regex },
                ...normalizedSearchClauses(String(search)),
                { parentModel: regex },
                { nickName: regex },
                { itemCode: regex },
                { productName: regex },
                { productDescription: regex },
                { brand: regex }
            ];
        }

        const limitValue = Math.min(Math.max(parseInt(limit as string, 10) || 25, 1), 100);

        const partNumbers = await Product.find(filter)
            .select('partNo itemCode productDescription brand aliases isGeneric')
            .sort({ partNo: 1 })
            .limit(limitValue);

        return res.status(200).json({
            success: true,
            message: 'Part numbers fetched successfully',
            data: partNumbers
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
};

