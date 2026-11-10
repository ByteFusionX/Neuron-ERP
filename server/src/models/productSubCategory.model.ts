import { Schema, model, Types } from "mongoose";

interface ProductSubCategory {
    subCategoryName: string;
    /** Parent sales department. */
    department: Types.ObjectId;
    /** Optional head of the sub department. */
    departmentHead?: Types.ObjectId;
    createdBy: Types.ObjectId;
    createdDate: Date;
    isDeleted: boolean;
    isActive: boolean;
}

const productSubCategorySchema = new Schema<ProductSubCategory>({
    subCategoryName: { type: String, required: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentHead: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    createdDate: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
});

export default model<ProductSubCategory>('ProductSubCategory', productSubCategorySchema);
