
import { Schema, Types } from "mongoose";

interface supplierSchemaInterface {
    supplierId: string;
    supplierName: string;
    address: AddressInterface;
    supplierType: supplierType;
    category: string;
    contactDetails: contactDetailsInterface[];
    documents?: any[];
    status: supplierStatus;
    paymentTerms: string[];
    products: string[];
    creditDays: string;
    creditValue: number;
    createdDate: Date;
    updatedDate: Date;
    createdBy: Types.ObjectId;
    approvedDate: Date;
    approvedBy: Types.ObjectId;
}

enum supplierStatus {
    pending = "Pending",
    approved = "Approved",
    rejected = "Rejected",
}

enum supplierType {
    OEM = "OEM",
    Distributor = "Distributor",
    superStockiest = "Super Stockiest",
    Reseller = "Reseller",
}

interface contactDetailsInterface {
    contactName: string;
    contactDesignation: string;
    contactNumber: string
}
interface AddressInterface {
    StreetNo: string;
    buildingNo: string;
    zoneNo: string;
    poBox: string;
    location: string;
    city: string;
}

const contactDetailsSchema = new Schema<contactDetailsInterface>({
    contactName: {
        type: String,
        required: true,
    },
    contactDesignation: {
        type: String,
        required: true,
    },
    contactNumber: {
        type: String,
        required: true,
    },
})

const Address = new Schema<AddressInterface>({
    StreetNo: String,
    buildingNo: String,
    zoneNo: String,
    poBox: String,
    location: String,
    city: String,
})


const supplierSchema = new Schema<supplierSchemaInterface>({
    supplierId: {
        type: String,
        required: true,
        unique: true,
    },
    supplierName: {
        type: String,
        required: true,
    },
    address: {
        type: Address,
        required: true,
    },
    supplierType: {
        type: String,
        enum: Object.values(supplierType),
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    contactDetails: {
        type: [contactDetailsSchema],
        required: true,
    },
    documents: {
        type: [],
        default: [],
    },
    status: {
        type: String,
        enom: Object.values(supplierStatus),
        default: supplierStatus.pending,
        required: true,
    },
    paymentTerms: {
        type: [String],
        required: true,
    },
    products: {
        type: [String],
        required: true,
    },
    creditDays: {
        type: String,
        required: true,
    },
    creditValue: {
        type: Number,
        required: true,
    },
    createdDate: {
        type: Date,
        default: Date.now,
    },
    updatedDate: {
        type: Date,
        default: Date.now,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    approvedDate: {
        type: Date,
        default: Date.now,
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },

})
