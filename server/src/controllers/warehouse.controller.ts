import { Request, Response, NextFunction } from "express";
import Warehouse from "../models/warehouse.model";
import { getEmployeeData } from "../common/utils/util";
import { ObjectId } from "mongodb";
import Product from "../models/products.model";

export const createWarehouse = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const token = (req as any).user;

        if (!data.wareHouseName || !data.createdDate) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const exists = await Warehouse.findOne({ wareHouseName: new RegExp(`^${data.wareHouseName.trim()}$`, 'i'), isDeleted: { $ne: true } });
        if (exists) return res.status(409).json({ message: "Warehouse name already exists" });

        const employee = await getEmployeeData(token);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const warehouse = await Warehouse.create({
            wareHouseName: data.wareHouseName.trim(),
            createdBy: employee._id,
            createdDate: data.createdDate,
            isActive: data.isActive !== false,
            isDeleted: false
        });

        return res.status(201).json(warehouse);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getWarehouses = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const warehouses = await Warehouse.find({ isDeleted: { $ne: true } }).sort({ createdDate: -1 });
        if (!warehouses || warehouses.length === 0) return res.status(204).json();
        return res.status(200).json(warehouses);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getWarehouseById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const warehouse = await Warehouse.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
        return res.status(200).json(warehouse);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateWarehouse = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        if (data.wareHouseName) {
            const exist = await Warehouse.findOne({ _id: { $ne: id }, wareHouseName: new RegExp(`^${data.wareHouseName.trim()}$`, 'i'), isDeleted: { $ne: true } });
            if (exist) return res.status(409).json({ message: "Warehouse name already exists" });
        }

        const updated = await Warehouse.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            { $set: { ...(data.wareHouseName ? { wareHouseName: data.wareHouseName.trim() } : {}), ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}) } },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: "Warehouse not found" });
        return res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteWarehouse = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const inUse = await Product.countDocuments({ warehouse: id, isDeleted: { $ne: true } });
        if (inUse) return res.status(409).json({ message: `Used by ${inUse} product${inUse === 1 ? '' : 's'}. Move them to another warehouse first.` });
        const deleted = await Warehouse.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $set: { isDeleted: true } }, { new: true });
        if (!deleted) return res.status(404).json({ message: "Warehouse not found or already deleted" });
        return res.status(200).json({ success: true, message: "Warehouse deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};


