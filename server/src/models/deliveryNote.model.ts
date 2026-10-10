import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryNote extends Document {
    dnNo: string;
    dnDate: Date;
    jobId: mongoose.Types.ObjectId;
    clientName: string;
    customerLpoNumber: string;
    subject: string;
    deliveryType?: string;
    shipToName?: string;
    shipToAddress?: string;
    contactPerson?: string;
    contactNo?: string;
    promisedDate?: Date;
    deliveryInstructions?: string;
    pod?: {
        receivedBy?: string;
        receivedContactNo?: string;
        receivedDate?: Date;
        remarks?: string;
        signatureName?: string;
    };
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
        rejectedQty: number;
        rejectionReason?: string;
    }[];
    status: string;
    rejectedHistory: {
        rejectedBy: mongoose.Types.ObjectId;
        reason: string;
        date: Date;
    }[];
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
    deliveryType: { type: String, enum: ['Customer Delivery', 'Project Site', 'Customer Pickup', 'Drop Ship', 'Replacement'], default: 'Customer Delivery' },
    shipToName: { type: String },
    shipToAddress: { type: String },
    contactPerson: { type: String },
    contactNo: { type: String },
    promisedDate: { type: Date },
    deliveryInstructions: { type: String },
    pod: {
        receivedBy: String,
        receivedContactNo: String,
        receivedDate: Date,
        remarks: String,
        signatureName: String
    },
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
        unitSellingPrice: Number,
        rejectedQty: { type: Number, default: 0 },
        rejectionReason: String
    }],
    status: {
        type: String,
        enum: ['Draft', 'Ready for Dispatch', 'Dispatched', 'Delivered', 'Cancelled', 'Rejected', 'Partially Rejected'],
        default: 'Draft'
    },
    rejectedHistory: [{
        rejectedBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
        reason: String,
        date: { type: Date, default: Date.now }
    }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdDate: { type: Date, default: Date.now },
    updatedDate: { type: Date }
});

export default mongoose.model<IDeliveryNote>('DeliveryNote', DeliveryNoteSchema);
