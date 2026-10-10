import { Request, Response } from "express";
import MasterListItemModel, { LIST_MODULE, MASTER_LISTS, MasterListName } from '../models/masterListItem.model';
import { getEmployeeData } from "../common/utils/util";

const validList = (list: string) => (MASTER_LISTS as readonly string[]).includes(list);

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Names are unique per list ignoring case, so "pcs" and "PCS" can't both exist. */
const labelTaken = (list: string, label: string, excludeId?: string) =>
    MasterListItemModel.exists({ list, isDeleted: { $ne: true }, label: new RegExp(`^${escapeRegex(label)}$`, 'i'), ...(excludeId ? { _id: { $ne: excludeId } } : {}) });

const parseValue = (raw: unknown): number | null | undefined => {
    if (raw === null || raw === '' || raw === undefined) return null;
    const n = Number(raw);
    return Number.isNaN(n) || n < 0 ? undefined : n;
};

export const getMasterListItems = async (req: Request, res: Response) => {
    try {
        const { list } = req.params;
        if (!validList(list)) return res.status(400).json({ success: false, message: "Invalid list" });
        const items = await MasterListItemModel.find({ list, isDeleted: { $ne: true } }).sort({ label: 1 }).populate('createdBy', 'firstName lastName');
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
        if (await labelTaken(list, label)) return res.status(409).json({ success: false, message: "That name already exists in this list" });
        const creator = await getEmployeeData(req.user);
        const item = await MasterListItemModel.create({ module: LIST_MODULE[list as MasterListName], list, label, value, isActive: req.body.isActive === undefined ? true : !!req.body.isActive, createdBy: creator?._id ?? null });
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
        const editor = await getEmployeeData(req.user);
        const update: Record<string, unknown> = { updatedBy: editor?._id ?? null };
        if (req.body.label !== undefined) {
            const label = String(req.body.label).trim();
            if (!label) return res.status(400).json({ success: false, message: "Name is required" });
            if (await labelTaken(list, label, id)) return res.status(409).json({ success: false, message: "That name already exists in this list" });
            update.label = label;
        }
        if (req.body.value !== undefined) {
            const value = parseValue(req.body.value);
            if (value === undefined) return res.status(400).json({ success: false, message: "Value must be a non-negative number" });
            update.value = value;
        }
        if (req.body.isActive !== undefined) update.isActive = !!req.body.isActive;
        const item = await MasterListItemModel.findOneAndUpdate({ _id: id, list, isDeleted: { $ne: true } }, update, { new: true, runValidators: true });
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
        const existing = await MasterListItemModel.findOne({ _id: id, list, isDeleted: { $ne: true } });
        if (!existing) return res.status(404).json({ success: false, message: "Item not found" });
        if (existing.isSystem) return res.status(400).json({ success: false, message: "Default items can't be deleted. Hide it instead." });
        const editor = await getEmployeeData(req.user);
        existing.isDeleted = true;
        existing.isActive = false;
        existing.deletedAt = new Date();
        existing.deletedBy = editor?._id ?? null;
        await existing.save();
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting master list item:', error);
        return res.status(500).json({ success: false, message: "Failed to delete item" });
    }
};
