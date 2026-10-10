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
import StockEntry from "../models/stockEntry.model";
import Item from "../models/item.model";
import { logAudit } from "../services/audit.service";

const auditProduct = (req: Request, product: any, action: string, summary: string, changes?: { label: string; from?: string; to?: string }[]) =>
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

const isAdminRole =(employee: any): boolean => ['admin', 'superAdmin'].includes(employee?.category?.role);

const getDepartmentCode = (departmentName?: string): string => {
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

        const pattern = /^NR-ITM-[A-Z]+-(\d+)$/i;
        const products = await Product.find({ itemCode: { $regex: pattern } }).select('itemCode').lean();

        let maxNum = 0;
        for (const product of products) {
            const match = (product.itemCode || '').match(pattern);
            if (match) {
                maxNum = Math.max(maxNum, parseInt(match[1], 10));
            }
        }

        const itemCode = `NR-ITM-${deptCode}-${(maxNum + 1).toString().padStart(4, '0')}`;

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
        if (blank(data.partNo) || blank(data.itemCode) || blank(data.productDescription) || blank(data.brand) || !data.productCategory || !data.productSegment || !data.warehouse) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const moneyError = validateMoney(data);
        if (moneyError) return res.status(400).json({ message: moneyError });

        // Ensure refs are valid ObjectIds
        const refIds = [data.productCategory, data.productSegment, data.warehouse];
        if (!refIds.every((id: string) => ObjectId.isValid(id))) {
            return res.status(400).json({ message: "Invalid reference id(s) provided" });
        }

        // Uniqueness check on partNo (case-insensitive)
        const existing = await Product.findOne({ partNo: new RegExp(`^${escapeRegex(data.partNo.trim())}$`, 'i'), isDeleted: { $ne: true } });
        if (existing) {
            return res.status(409).json({ message: "Product with this part number already exists" });
        }

        // Uniqueness check on itemCode (case-insensitive)
        const existingItemCode = await Product.findOne({ itemCode: new RegExp(`^${escapeRegex(data.itemCode.trim())}$`, 'i'), isDeleted: { $ne: true } });
        if (existingItemCode) {
            return res.status(409).json({ message: "Product with this item code already exists" });
        }

        // Validate referenced docs exist
        const [categoryExist, segmentExist, warehouseExist] = await Promise.all([
            ProductCategory.findById(data.productCategory),
            Department.findById(data.productSegment),
            Warehouse.findById(data.warehouse)
        ]);
        if (!categoryExist || !segmentExist || !warehouseExist) {
            return res.status(400).json({ message: "Invalid references provided" });
        }

        const employee = await getEmployeeData(token);
        if (!employee) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const product = await Product.create({
            partNo: data.partNo.trim(),
            itemCode: data.itemCode.trim(),
            productName: data.productName?.trim(),
            productDescription: data.productDescription.trim(),
            productCategory: data.productCategory,
            productSegment: data.productSegment,
            warehouse: data.warehouse,
            brand: data.brand.trim(),
            type: data.type,
            unitOfMeasure: data.unitOfMeasure?.trim(),
            defaultTaxRate: data.defaultTaxRate,
            defaultSellingPrice: data.defaultSellingPrice,
            estimatedCost: data.estimatedCost,
            isActive: data.isActive ?? true,
            // New items wait for approval before they can be used; admins are auto-approved.
            approvalStatus: isAdminRole(employee) ? 'Approved' : 'Pending',
            ...(isAdminRole(employee) ? { approvedBy: employee._id, approvedDate: new Date() } : {}),
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

        await auditProduct(req, product, "created", `Product ${product.itemCode} created${isAdminRole(employee) ? "" : " and sent for approval"}`);
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

        const moneyError = validateMoney(data);
        if (moneyError) return res.status(400).json({ message: moneyError });

        // Optional uniqueness check if partNo changes
        if (data.partNo) {
            const exist = await Product.findOne({ _id: { $ne: id }, partNo: new RegExp(`^${escapeRegex(data.partNo.trim())}$`, 'i'), isDeleted: { $ne: true } });
            if (exist) return res.status(409).json({ message: "Product with this part number already exists" });
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

        // A non-admin edit (re)submits the item for approval; a rejected item is resubmitted this way.
        const needsReapproval = !isAdminRole(employee);
        // An admin has no one to approve for them, so editing a rejected item approves it again.
        const rejected = isAdminRole(employee) && !!(await Product.exists({ _id: id, isDeleted: { $ne: true }, approvalStatus: 'Draft' }));

        const before = await Product.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate("productCategory").populate("productSegment").populate("warehouse").lean();

        const updated = await Product.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            {
                $set: {
                    ...(data.partNo ? { partNo: data.partNo.trim() } : {}),
                    ...(data.itemCode ? { itemCode: data.itemCode.trim() } : {}),
                    ...(data.productDescription ? { productDescription: data.productDescription.trim() } : {}),
                    ...(data.productCategory ? { productCategory: data.productCategory } : {}),
                    ...(data.productSegment ? { productSegment: data.productSegment } : {}),
                    ...(data.warehouse ? { warehouse: data.warehouse } : {}),
                    ...(data.brand ? { brand: data.brand.trim() } : {}),
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
        if (rejected) await auditProduct(req, updated, "approved", "Approved on edit (was rejected)");
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
            StockEntry.countDocuments({ ...live, partNo: id }),
            Item.countDocuments({ partNo: id }),
        ]);
        const used = ([[quotes, 'quotation'], [rfqs, 'RFQ'], [orders, 'purchase order'], [stock, 'stock entry'], [items, 'inventory item']] as [number, string][])
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
                { itemCode: regex },
                { productName: regex },
                { productDescription: regex },
                { brand: regex }
            ];
        }

        const limitValue = Math.min(Math.max(parseInt(limit as string, 10) || 25, 1), 100);

        const partNumbers = await Product.find(filter)
            .select('partNo itemCode productDescription brand')
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

