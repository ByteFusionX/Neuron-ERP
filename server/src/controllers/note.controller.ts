import { NextFunction, Response, Request } from "express";
import MasterListItemModel, { LIST_MODULE, MasterListName } from '../models/masterListItem.model';
import { getEmployeeData } from "../common/utils/util";

// Notes & terms now live in the master-list collection. The API keeps its old shape
// ({ customerNotes: [{ _id, note }], ... }) so the quotation and LPO screens are unchanged.
const NOTE_LISTS: Record<string, MasterListName> = {
    customerNotes: 'customerNote',
    termsAndConditions: 'termsAndConditions',
    placeOfDelivery: 'placeOfDelivery',
    shippingTerms: 'shippingTerms',
    purchaseTermsNotes: 'purchaseTermsNotes',
};

const buildNotes = async () => {
    const items = await MasterListItemModel.find({ list: { $in: Object.values(NOTE_LISTS) }, isDeleted: { $ne: true }, isActive: { $ne: false } })
        .sort({ createdAt: 1 }).lean();
    const result: Record<string, { _id: any; note: string }[]> = {};
    for (const [key, list] of Object.entries(NOTE_LISTS)) {
        result[key] = items.filter((i) => i.list === list).map((i) => ({ _id: i._id, note: i.label }));
    }
    return result;
};

const createNote = (key: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const note = String(req.body.note ?? '').trim();
        if (!note) return res.status(400).json({ message: "Note is required" });
        const list = NOTE_LISTS[key];
        const creator = await getEmployeeData(req.user);
        await MasterListItemModel.create({ module: LIST_MODULE[list], list, label: note, createdBy: creator?._id ?? null });
        res.status(200).json(await buildNotes());
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ message: "That entry already exists" });
        console.log(error)
        next(error)
    }
}

export const createCustomerNote = createNote('customerNotes');
export const createTermsAndCondition = createNote('termsAndConditions');
export const createPlaceOfDelivery = createNote('placeOfDelivery');
export const createShippingTerms = createNote('shippingTerms');
export const createPurchaseTermsNote = createNote('purchaseTermsNotes');

export const updateNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { noteId } = req.params;
        const { noteType } = req.body;
        const note = String(req.body.note ?? '').trim();
        if (!note) return res.status(400).json({ message: "Note is required" });
        const list = noteType === 'customerNote' ? 'customerNote'
            : noteType === 'placeOfDelivery' ? 'placeOfDelivery'
            : noteType === 'shippingTerms' ? 'shippingTerms'
            : noteType === 'purchaseTermsNotes' ? 'purchaseTermsNotes'
            : 'termsAndConditions';
        const editor = await getEmployeeData(req.user);
        const updated = await MasterListItemModel.findOneAndUpdate(
            { _id: noteId, list, isDeleted: { $ne: true } },
            { label: note, updatedBy: editor?._id ?? null },
            { new: true }
        );
        if (!updated) return res.status(502).json();
        return res.status(200).json(await buildNotes());
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ message: "That entry already exists" });
        console.log(error)
        next(error)
    }
}

export const deleteNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { noteId, noteType } = req.params;
        const list = NOTE_LISTS[noteType];
        if (!list) return res.status(400).json({ message: "Invalid note type" });
        const editor = await getEmployeeData(req.user);
        const result = await MasterListItemModel.updateOne(
            { _id: noteId, list, isDeleted: { $ne: true } },
            { isDeleted: true, isActive: false, deletedAt: new Date(), deletedBy: editor?._id ?? null }
        );
        if (result.modifiedCount === 1) return res.status(200).json({ success: true })
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(200).json(await buildNotes());
    } catch (error) {
        console.log(error)
        next(error)
    }
}
