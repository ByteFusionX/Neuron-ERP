import { Request, Response, NextFunction } from "express";
import ProductCategory from "../models/productCategory.model";
import { getEmployeeData } from "../common/utils/util";
import { ObjectId } from "mongodb";

export const createProductCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.categoryName || !data.createdDate) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const exists = await ProductCategory.findOne({ categoryName: new RegExp(`^${data.categoryName.trim()}$`, 'i'), isDeleted: { $ne: true } });
        if (exists) return res.status(409).json({ message: "Category name already exists" });

        const employee = await getEmployeeData(token);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const category = await ProductCategory.create({
            categoryName: data.categoryName.trim(),
            createdBy: employee._id,
            createdDate: data.createdDate,
            isDeleted: false
        });

        return res.status(201).json(category);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProductCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categories = await ProductCategory.find({ isDeleted: { $ne: true } }).sort({ createdDate: -1 });
        if (!categories || categories.length === 0) return res.status(204).json();
        return res.status(200).json(categories);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProductCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const category = await ProductCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!category) return res.status(404).json({ message: "Category not found" });
        return res.status(200).json(category);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateProductCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        if (data.categoryName) {
            const exist = await ProductCategory.findOne({ _id: { $ne: id }, categoryName: new RegExp(`^${data.categoryName.trim()}$`, 'i'), isDeleted: { $ne: true } });
            if (exist) return res.status(409).json({ message: "Category name already exists" });
        }

        const updated = await ProductCategory.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            { $set: { ...(data.categoryName ? { categoryName: data.categoryName.trim() } : {}) } },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: "Category not found" });
        return res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteProductCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const deleted = await ProductCategory.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $set: { isDeleted: true } }, { new: true });
        if (!deleted) return res.status(404).json({ message: "Category not found or already deleted" });
        return res.status(200).json({ success: true, message: "Category deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};


