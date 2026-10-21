import { Schema, model,Types } from "mongoose";

interface Warehouse {
    wareHouseName: string;
    createdBy: Types.ObjectId;
    createdDate: Date;
    isActive: boolean;
    isDeleted: boolean;
}


const warehouseSchema = new Schema<Warehouse>({
    wareHouseName: {
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
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

export default model<Warehouse>('Warehouse', warehouseSchema);
