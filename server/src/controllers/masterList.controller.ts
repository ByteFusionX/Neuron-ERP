import { Request, Response } from "express";
import MasterListItemModel, { LIST_MODULE, MASTER_LISTS, MasterListName } from '../models/masterListItem.model';
import { getEmployeeData } from "../common/utils/util";
import Product from '../models/products.model';
import Supplier from '../models/supplier.model';

/** Products store units and brands as text, so these lists need a usage check and a rename cascade. */
const PRODUCT_TEXT_FIELD: Record<string, string> = { unit: 'unitOfMeasure', brand: 'brand' };
const productsUsing = (list: string, label: string) => {
    const field = PRODUCT_TEXT_FIELD[list];
    return field ? Product.countDocuments({ isDeleted: { $ne: true }, [field]: new RegExp(`^${escapeRegex(label)}$`, 'i') }) : Promise.resolve(0);
};

/** Suppliers keep their type as text and their category as a reference to the list item. */
const suppliersUsing = (list: string, item: { _id: any; label: string }) => {
    if (list === 'supplierType') return Supplier.countDocuments({ isDeleted: { $ne: true }, supplierType: new RegExp(`^${escapeRegex(item.label)}$`, 'i') });
    if (list === 'supplierCategory') return Supplier.countDocuments({ isDeleted: { $ne: true }, category: item._id });
    return Promise.resolve(0);
};

/** Notes and terms are paragraphs, not short option names. */
const TEXT_LISTS = ['customerNote', 'termsAndConditions', 'placeOfDelivery', 'shippingTerms', 'purchaseTermsNotes'];

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
        // Units and availability can be added from any form, so keep junk and pasted text out of the shared list.
        const maxLabel = TEXT_LISTS.includes(list) ? 10000 : 40;
        if (label.length > maxLabel) return res.status(400).json({ success: false, message: `Name must be ${maxLabel} characters or fewer` });
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
        let renamedFrom: string | null = null;
        if (req.body.label !== undefined) {
            const label = String(req.body.label).trim();
            if (!label) return res.status(400).json({ success: false, message: "Name is required" });
            if (await labelTaken(list, label, id)) return res.status(409).json({ success: false, message: "That name already exists in this list" });
            update.label = label;
            const before = await MasterListItemModel.findOne({ _id: id, list, isDeleted: { $ne: true } }).select('label').lean();
            if (before && before.label !== label) renamedFrom = before.label;
        }
        if (req.body.value !== undefined) {
            const value = parseValue(req.body.value);
            if (value === undefined) return res.status(400).json({ success: false, message: "Value must be a non-negative number" });
            update.value = value;
        }
        if (req.body.isActive !== undefined) update.isActive = !!req.body.isActive;
        const item = await MasterListItemModel.findOneAndUpdate({ _id: id, list, isDeleted: { $ne: true } }, update, { new: true, runValidators: true });
        if (!item) return res.status(404).json({ success: false, message: "Item not found" });
        // Keep products pointing at the renamed unit / brand instead of orphaning them.
        const field = PRODUCT_TEXT_FIELD[list];
        if (renamedFrom && field) {
            await Product.updateMany({ isDeleted: { $ne: true }, [field]: new RegExp(`^${escapeRegex(renamedFrom)}$`, 'i') }, { $set: { [field]: item.label } });
        }
        if (renamedFrom && list === 'supplierType') {
            await Supplier.updateMany({ isDeleted: { $ne: true }, supplierType: new RegExp(`^${escapeRegex(renamedFrom)}$`, 'i') }, { $set: { supplierType: item.label } });
        }
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
        const inUse = await productsUsing(list, existing.label);
        if (inUse) return res.status(409).json({ success: false, message: `Used by ${inUse} product${inUse === 1 ? '' : 's'}. Hide it instead of deleting.` });
        const suppliersInUse = await suppliersUsing(list, existing);
        if (suppliersInUse) return res.status(409).json({ success: false, message: `Used by ${suppliersInUse} supplier${suppliersInUse === 1 ? '' : 's'}. Hide it instead of deleting.` });
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
