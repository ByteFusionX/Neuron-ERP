import { Request, Response, NextFunction } from "express";
import Product from "../models/products.model";
import Department from "../models/department.model";
import ProductCategory from "../models/productCategory.model";
import Warehouse from "../models/warehouse.model";
import { getEmployeeData } from "../common/utils/util";
import { ObjectId } from "mongodb";

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.partNo || !data.productDescription || !data.productCategory || !data.productSegment || !data.warehouse || !data.createdDate) {
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
            productDescription: data.productDescription.trim(),
            productCategory: data.productCategory,
            productSegment: data.productSegment,
            warehouse: data.warehouse,
            createdBy: employee._id,
            createdDate: data.createdDate,
            updatedDate: new Date(),
            isDeleted: false
        });

        const populated = await Product.findById(product._id)
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse');

        return res.status(201).json(populated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const products = await Product.find({ isDeleted: { $ne: true } })
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse')
            .sort({ createdDate: -1 });

        if (!products || products.length === 0) {
            return res.status(204).json();
        }
        return res.status(200).json(products);
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
            .populate('warehouse');
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

        const updated = await Product.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            {
                $set: {
                    ...(data.partNo ? { partNo: data.partNo.trim() } : {}),
                    ...(data.productDescription ? { productDescription: data.productDescription.trim() } : {}),
                    ...(data.productCategory ? { productCategory: data.productCategory } : {}),
                    ...(data.productSegment ? { productSegment: data.productSegment } : {}),
                    ...(data.warehouse ? { warehouse: data.warehouse } : {}),
                    updatedBy: employee._id,
                    updatedDate: new Date()
                }
            },
            { new: true }
        )
            .populate('productCategory')
            .populate('productSegment')
            .populate('warehouse');

        if (!updated) return res.status(404).json({ message: "Product not found" });
        return res.status(200).json(updated);
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


