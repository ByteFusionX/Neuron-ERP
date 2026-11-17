import { Schema, model, Types } from "mongoose";

/** A place inside a warehouse where stock sits (shelf, rack, zone). Master data for the Area field on stock adjustments. */
interface StockArea {
    areaName: string;
    createdBy: Types.ObjectId;
    createdDate: Date;
    isActive: boolean;
    isDeleted: boolean;
}

const stockAreaSchema = new Schema<StockArea>({
    areaName: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    createdDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
});

export default model<StockArea>('StockArea', stockAreaSchema);
