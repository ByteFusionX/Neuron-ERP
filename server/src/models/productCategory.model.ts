import { Schema, model,Types } from "mongoose";

interface ProductCategory {
    categoryName: string;
    createdBy: Types.ObjectId;
    createdDate: Date;
    isDeleted: boolean;
}


const productCategorySchema = new Schema<ProductCategory>({
    categoryName: {
        type: String,
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
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
});

export default model<ProductCategory>('ProductCategory', productCategorySchema);
