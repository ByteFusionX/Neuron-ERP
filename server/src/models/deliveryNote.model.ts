import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryNote extends Document {
    dnNo: string;
    dnDate: Date;
    jobId: mongoose.Types.ObjectId;
    clientName: string;
    customerLpoNumber: string;
    subject: string;
    items: {
        slNo: number;
        partNo: string;
        description: string;
        orderedQty: number;
        deliveredQty: number;
        currentDeliveryQty: number;
        serialNos: string[];
        status: string;
        itemId: string; // Ref to original Item ID in Job/Quote
        isInventoryItem: boolean;
        unitSellingPrice: number;
    }[];
    status: string;
    createdBy: mongoose.Types.ObjectId;
    createdDate: Date;
    updatedDate: Date;
}

const DeliveryNoteSchema: Schema = new Schema({
    dnNo: { type: String, required: true, unique: true },
    dnDate: { type: Date, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    clientName: { type: String },
    customerLpoNumber: { type: String },
    subject: { type: String },
    items: [{
        slNo: Number,
        partNo: String,
        description: String,
        orderedQty: Number,
        deliveredQty: Number,
        currentDeliveryQty: Number,
        serialNos: [String],
        status: String,
        itemId: String,
        isInventoryItem: Boolean,
        unitSellingPrice: Number
    }],
    status: {
        type: String,
        enum: ['Draft', 'Delivered', 'Cancelled'],
        default: 'Draft'
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdDate: { type: Date, default: Date.now },
    updatedDate: { type: Date }
});

export default mongoose.model<IDeliveryNote>('DeliveryNote', DeliveryNoteSchema);
