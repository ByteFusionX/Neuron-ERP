import { Schema, model,Types } from "mongoose";

interface ProductCategory {
    categoryName: string;
    createdBy: Types.ObjectId;
    createdDate: Date;
    isDeleted: boolean;
    isActive: boolean;
}


const productCategorySchema = new Schema<ProductCategory>({
    categoryName: {
        type: String,
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    createdDate: {
        type: Date,
        required: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    // Categories typed in via "Other" on a product start inactive; absent on older rows, which count as active.
    isActive: {
        type: Boolean,
        default: true,
    },
});

export default model<ProductCategory>('ProductCategory', productCategorySchema);
