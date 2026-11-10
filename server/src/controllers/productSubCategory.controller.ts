import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import ProductSubCategory from "../models/productSubCategory.model";
import Department from "../models/department.model";
import Product from "../models/products.model";
import { getEmployeeData } from "../common/utils/util";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createProductSubCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const name = typeof data.subCategoryName === 'string' ? data.subCategoryName.trim() : '';
        if (!name || !data.department || !ObjectId.isValid(data.department)) {
            return res.status(400).json({ message: "Sub department name and parent department are required" });
        }
        const parent = await Department.findOne({ _id: data.department, isDeleted: { $ne: true } });
        if (!parent) return res.status(404).json({ message: "Parent department not found" });

        const exists = await ProductSubCategory.findOne({ department: data.department, subCategoryName: new RegExp(`^${escapeRegex(name)}$`, 'i'), isDeleted: { $ne: true } });
        if (exists) return res.status(409).json({ message: "Sub department already exists under this department" });

        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const created = await ProductSubCategory.create({
            subCategoryName: name,
            department: data.department,
            departmentHead: data.departmentHead && ObjectId.isValid(data.departmentHead) ? data.departmentHead : undefined,
            createdBy: employee._id,
            createdDate: data.createdDate || new Date(),
            isDeleted: false,
            isActive: data.isActive !== false,
        });
        return res.status(201).json(created);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getProductSubCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filter: any = { isDeleted: { $ne: true } };
        if (typeof req.query.department === 'string' && ObjectId.isValid(req.query.department)) filter.department = req.query.department;
        const items = await ProductSubCategory.find(filter).sort({ createdDate: -1 })
            .populate('createdBy', 'firstName lastName')
            .populate('department', 'departmentName')
            .populate('departmentHead', 'firstName lastName');
        if (!items.length) return res.status(204).json();
        return res.status(200).json(items);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateProductSubCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const current = await ProductSubCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!current) return res.status(404).json({ message: "Sub department not found" });

        const name = typeof data.subCategoryName === 'string' && data.subCategoryName.trim() ? data.subCategoryName.trim() : current.subCategoryName;
        const parentId = data.department && ObjectId.isValid(data.department) ? data.department : String(current.department);

        if (name !== current.subCategoryName || parentId !== String(current.department)) {
            const dup = await ProductSubCategory.findOne({ _id: { $ne: id }, department: parentId, subCategoryName: new RegExp(`^${escapeRegex(name)}$`, 'i'), isDeleted: { $ne: true } });
            if (dup) return res.status(409).json({ message: "Sub department already exists under this department" });
        }

        current.subCategoryName = name;
        current.department = parentId as any;
        if (typeof data.isActive === 'boolean') current.isActive = data.isActive;
        if ('departmentHead' in data) current.departmentHead = data.departmentHead && ObjectId.isValid(data.departmentHead) ? data.departmentHead : undefined;
        await current.save();
        return res.status(200).json(current);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteProductSubCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const item = await ProductSubCategory.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!item) return res.status(404).json({ message: "Sub department not found or already deleted" });
        const inUse = await Product.countDocuments({ productSegment: item.department, productSubCategory: item.subCategoryName, isDeleted: { $ne: true } });
        if (inUse) return res.status(409).json({ message: `Used by ${inUse} product${inUse === 1 ? '' : 's'}. Move them to another sub department first.` });
        item.isDeleted = true;
        await item.save();
        return res.status(200).json({ success: true, message: "Sub department deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};
