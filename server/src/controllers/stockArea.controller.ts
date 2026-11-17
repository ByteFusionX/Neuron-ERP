import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import StockArea from "../models/stockArea.model";
import { getEmployeeData } from "../common/utils/util";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = (name: string) => new RegExp(`^${escape(name.trim())}$`, 'i');

export const createStockArea = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data: any = req.body;
        const name = String(data.areaName ?? '').trim();
        if (!name) return res.status(400).json({ message: "Area name is required" });

        const exists = await StockArea.findOne({ areaName: sameName(name), isDeleted: { $ne: true } });
        if (exists) return res.status(409).json({ message: "Area name already exists" });

        const employee = await getEmployeeData((req as any).user);
        if (!employee) return res.status(401).json({ message: "Unauthorized" });

        const area = await StockArea.create({
            areaName: name,
            createdBy: employee._id,
            createdDate: data.createdDate || new Date(),
            isActive: data.isActive !== false,
            isDeleted: false,
        });
        return res.status(201).json(area);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const getStockAreas = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const areas = await StockArea.find({ isDeleted: { $ne: true } })
            .populate('createdBy', 'firstName lastName')
            .sort({ areaName: 1 });
        return res.status(200).json(areas);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const updateStockArea = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data: any = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

        const name = typeof data.areaName === 'string' ? data.areaName.trim() : '';
        if (name) {
            const exists = await StockArea.findOne({ _id: { $ne: id }, areaName: sameName(name), isDeleted: { $ne: true } });
            if (exists) return res.status(409).json({ message: "Area name already exists" });
        }

        const updated = await StockArea.findOneAndUpdate(
            { _id: id, isDeleted: { $ne: true } },
            { $set: { ...(name ? { areaName: name } : {}), ...(typeof data.isActive === 'boolean' ? { isActive: data.isActive } : {}) } },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: "Area not found" });
        return res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        next(error);
    }
};

export const deleteStockArea = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
        const deleted = await StockArea.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $set: { isDeleted: true } }, { new: true });
        if (!deleted) return res.status(404).json({ message: "Area not found or already deleted" });
        return res.status(200).json({ success: true, message: "Area deleted" });
    } catch (error) {
        console.error(error);
        next(error);
    }
};
