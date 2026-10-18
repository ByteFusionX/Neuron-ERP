import { model, Schema } from "mongoose";

export const MASTER_LISTS = ['unit', 'availability', 'customerNote', 'termsAndConditions', 'placeOfDelivery', 'shippingTerms', 'purchaseTermsNotes', 'paymentTerms', 'source', 'creditStatus', 'currency', 'brand', 'supplierType', 'supplierCategory'] as const;
export type MasterListName = typeof MASTER_LISTS[number];

export const MASTER_MODULES = ['product', 'customer', 'purchase', 'sales', 'general'] as const;
export type MasterModule = typeof MASTER_MODULES[number];

// Which module owns each list. A new dropdown only needs an entry here and in MASTER_LISTS.
export const LIST_MODULE: Record<MasterListName, MasterModule> = {
    unit: 'product',
    availability: 'product',
    customerNote: 'sales',
    termsAndConditions: 'general',
    placeOfDelivery: 'purchase',
    shippingTerms: 'purchase',
    purchaseTermsNotes: 'purchase',
    paymentTerms: 'customer',
    source: 'customer',
    creditStatus: 'customer',
    currency: 'customer',
    brand: 'product',
    supplierType: 'purchase',
    supplierCategory: 'purchase',
};

export interface MasterListItem {
    module: MasterModule;
    // The dropdown this item belongs to (e.g. unit, tax).
    list: MasterListName;
    label: string;
    // Stable machine key, so code can rely on it even if the label is renamed.
    code?: string | null;
    description?: string | null;
    // Days for paymentTerms, percentage for tax. Unused for unit.
    value: number | null;
    sortOrder: number;
    isActive: boolean;
    // System items are seeded defaults: they can be hidden but not deleted.
    isSystem: boolean;
    isDeleted: boolean;
    deletedAt?: Date | null;
    deletedBy?: any;
    createdBy?: any;
    updatedBy?: any;
}

const masterListItemSchema = new Schema<MasterListItem>({
    module: { type: String, enum: MASTER_MODULES, required: true, index: true },
    list: { type: String, enum: MASTER_LISTS, required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 10000 },
    code: { type: String, trim: true, default: null },
    description: { type: String, trim: true, maxlength: 200, default: null },
    value: { type: Number, default: null, min: 0 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
}, { timestamps: true });

// A name is unique within a list only among live items, so a deleted name can be re-added.
masterListItemSchema.index(
    { module: 1, list: 1, label: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } }
);

const MasterListItemModel = model<MasterListItem>('MasterListItem', masterListItemSchema);
export default MasterListItemModel;
