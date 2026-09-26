import { model, Schema } from "mongoose";

export const MASTER_LISTS = ['paymentTerms', 'tax', 'unit', 'source', 'industry'] as const;
export type MasterListName = typeof MASTER_LISTS[number];

export interface MasterListItem {
    list: MasterListName;
    label: string;
    // Days for paymentTerms, percentage for tax. Unused for unit.
    value: number | null;
    isActive: boolean;
}

const masterListItemSchema = new Schema<MasterListItem>({
    list: { type: String, enum: MASTER_LISTS, required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    value: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

masterListItemSchema.index({ list: 1, label: 1 }, { unique: true });

const MasterListItemModel = model<MasterListItem>('MasterListItem', masterListItemSchema);
export default MasterListItemModel;
