import { Request, Response } from "express";
import MasterListItemModel, { MASTER_LISTS } from '../models/masterListItem.model';

const validList = (list: string) => (MASTER_LISTS as readonly string[]).includes(list);

const parseValue = (raw: unknown): number | null | undefined => {
    if (raw === null || raw === '' || raw === undefined) return null;
    const n = Number(raw);
    return Number.isNaN(n) || n < 0 ? undefined : n;
};

export const getMasterListItems = async (req: Request, res: Response) => {
    try {
        const { list } = req.params;
        if (!validList(list)) return res.status(400).json({ success: false, message: "Invalid list" });
        const items = await MasterListItemModel.find({ list }).sort({ label: 1 });
        return res.status(200).json({ success: true, data: items });
    } catch (error) {
        console.error('Error fetching master list:', error);
        return res.status(500).json({ success: false, message: "Failed to fetch list" });
    }
};

export const createMasterListItem = async (req: Request, res: Response) => {
    try {
        const { list } = req.params;
        if (!validList(list)) return res.status(400).json({ success: false, message: "Invalid list" });
        const label = String(req.body.label ?? '').trim();
        if (!label) return res.status(400).json({ success: false, message: "Name is required" });
        const value = parseValue(req.body.value);
        if (value === undefined) return res.status(400).json({ success: false, message: "Value must be a non-negative number" });
        const item = await MasterListItemModel.create({ list, label, value });
        return res.status(201).json({ success: true, data: item });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: "That name already exists in this list" });
        console.error('Error creating master list item:', error);
        return res.status(500).json({ success: false, message: "Failed to create item" });
    }
};

export const updateMasterListItem = async (req: Request, res: Response) => {
    try {
        const { list, id } = req.params;
        if (!validList(list)) return res.status(400).json({ success: false, message: "Invalid list" });
        const update: Record<string, unknown> = {};
        if (req.body.label !== undefined) {
            const label = String(req.body.label).trim();
            if (!label) return res.status(400).json({ success: false, message: "Name is required" });
            update.label = label;
        }
        if (req.body.value !== undefined) {
            const value = parseValue(req.body.value);
            if (value === undefined) return res.status(400).json({ success: false, message: "Value must be a non-negative number" });
            update.value = value;
        }
        if (req.body.isActive !== undefined) update.isActive = !!req.body.isActive;
        const item = await MasterListItemModel.findOneAndUpdate({ _id: id, list }, update, { new: true, runValidators: true });
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });
        return res.status(200).json({ success: true, data: item });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: "That name already exists in this list" });
        console.error('Error updating master list item:', error);
        return res.status(500).json({ success: false, message: "Failed to update item" });
    }
};

export const deleteMasterListItem = async (req: Request, res: Response) => {
    try {
        const { list, id } = req.params;
        if (!validList(list)) return res.status(400).json({ success: false, message: "Invalid list" });
        const item = await MasterListItemModel.findOneAndDelete({ _id: id, list });
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting master list item:', error);
        return res.status(500).json({ success: false, message: "Failed to delete item" });
    }
};
