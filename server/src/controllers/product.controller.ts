import { Request, Response, NextFunction } from "express";
import Product from "../models/products.model";
import Department from "../models/department.model";
import ProductCategory from "../models/productCategory.model";
import Warehouse from "../models/warehouse.model";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { ObjectId } from "mongodb";
import Employee from "../models/employee.model";
/** Legacy records have no approvalStatus; treat anything not Draft/Pending as usable. */
export const APPROVED_PRODUCT_FILTER = { approvalStatus: { $nin: ['Draft', 'Pending'] } };

const isAdminRole = (employee: any): boolean => ['admin', 'superAdmin'].includes(employee?.category?.role);

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

        if (!data.partNo || !data.itemCode || !data.productDescription || !data.productCategory || !data.productSegment || !data.warehouse || !data.brand || !data.createdDate) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Ensure refs are valid ObjectIds
        const refIds = [data.productCategory, data.productSegment, data.warehouse];
        if (!refIds.every((id: string) => ObjectId.isValid(id))) {
            return res.status(400).json({ message: "Invalid reference id(s) provided" });
        }

        // Uniqueness check on partNo (case-insensitive)
        const existing = await Product.findOne({ partNo: new RegExp(`^${data.partNo}$`, 'i'), isDeleted: { $ne: true } });
        if (existing) {
            return res.status(409).json({ message: "Product with this part number already exists" });
        }

        // Uniqueness check on itemCode (case-insensitive)
        const existingItemCode = await Product.findOne({ itemCode: new RegExp(`^${data.itemCode}$`, 'i'), isDeleted: { $ne: true } });
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
            createdDate: data.createdDate,
            updatedDate: new Date(),
            isDeleted: false
        });

        const populated = await Product.findById(product._id)
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .populate('createdBy', 'firstName lastName');

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
            createdBy
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
        const rowNum = Math.max(parseInt(row as string, 10) || 10, 1);
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
            const regex = new RegExp(searchTerm, 'i');
            filter.$or = [
                { partNo: regex },
                { itemCode: regex },
                { productDescription: regex },
                { brand: regex }
            ];
        }

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

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate('productCategory')
                .populate('productSegment')
                .populate('warehouse')
                .populate('createdBy', 'firstName lastName')
                .sort({ createdDate: -1 })
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

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        const token = (req as any).user;

        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        // Optional uniqueness check if partNo changes
        if (data.partNo) {
            const exist = await Product.findOne({ _id: { $ne: id }, partNo: new RegExp(`^${data.partNo}$`, 'i'), isDeleted: { $ne: true } });
            if (exist) return res.status(409).json({ message: "Product with this part number already exists" });
        }

        if (data.itemCode) {
            const existItemCode = await Product.findOne({ _id: { $ne: id }, itemCode: new RegExp(`^${data.itemCode}$`, 'i'), isDeleted: { $ne: true } });
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
                    updatedBy: employee._id,
                    updatedDate: new Date()
                },
                ...(needsReapproval ? { $unset: { approvedBy: '', approvedDate: '', rejectionReason: '' } } : {})
            },
            { new: true }
        )
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .populate('createdBy', 'firstName lastName');

        if (!updated) return res.status(404).json({ message: "Product not found" });
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

        const deleted = await Product.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $set: { isDeleted: true } }, { new: true });
        if (!deleted) return res.status(404).json({ message: "Product not found or already deleted" });
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
            const regex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { partNo: regex },
                { itemCode: regex },
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

