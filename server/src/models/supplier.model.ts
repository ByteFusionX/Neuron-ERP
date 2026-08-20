import { model, Schema, Types } from "mongoose";

interface supplierSchemaInterface {
    supplierId: string;
    supplierCode: string;
    supplierName: string;
    address: AddressInterface;
    supplierType: String;
    category: Types.ObjectId;
    contactDetails: contactDetailsInterface;
    bankDetails?: BankDetailsInterface;
    documents?: any[];
    status: supplierStatus;
    products: ProductsInterface[];
    creditDays: number;
    creditValue: number;
    createdDate: Date;
    updatedDate: Date;
    createdBy: Types.ObjectId;
    approvedHistory: {
        date: Date;
        reason: string;
        approvedBy: Types.ObjectId;
    }[];
    isDeleted: boolean;
    isBlocked: boolean;
    rejectHistory: {
        date: Date;
        reason: string;
        rejectedBy: Types.ObjectId;
    }[];
}

export enum supplierStatus {
    pending = "Pending",
    approved = "Approved",
    rejected = "Rejected",
}

interface contactDetailsInterface {
    name: string;
    email: string;
    phoneNumber: string
}
interface AddressInterface {
    streetNo: string;
    buildingNo: string;
    zoneNo: string;
    poBox: string;
    city: string;
    location: string;
}

interface BankDetailsInterface {
    bankName: string;
    branch: string;
    accountName: string;
    accountNumber: string;
    iban: string;
    swiftCode: string;
    currency: string;
    bankCountry: string;
    bankAddress: string;
}

interface ProductsInterface {
    productName: string;
    contactName: string;
    contactEmail: string;
    contactNo: string;
    paymentTerm: string;
}

const contactDetailsSchema = new Schema<contactDetailsInterface>({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    phoneNumber: {
        type: String,
        required: true,
    },
})

const Products = new Schema<ProductsInterface>({
    productName: {
        type: String,
    },
    contactName: {
        type: String,
    },
    contactEmail: {
        type: String,
    },
    contactNo: {
        type: String,
    },
    paymentTerm: {
        type: String,
        required: true,
    },
})


const Address = new Schema<AddressInterface>({
    streetNo: String,
    buildingNo: String,
    zoneNo: String,
    poBox: String,
    location: String,
    city: String,
})

const BankDetails = new Schema<BankDetailsInterface>({
    bankName: String,
    branch: String,
    accountName: String,
    accountNumber: String,
    iban: String,
    swiftCode: String,
    currency: String,
    bankCountry: String,
    bankAddress: String,
})


const supplierSchema = new Schema<supplierSchemaInterface>({
    supplierId: {
        type: String,
    },
    supplierCode: {
        type: String,
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
        required: true,
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
    },
    contactDetails: {
        type: contactDetailsSchema,
        required: true,
    },
    bankDetails: {
        type: BankDetails,
    },
    documents: {
        type: [],
        default: [],
    },
    status: {
        type: String,
        enum: Object.values(supplierStatus),
        default: supplierStatus.pending,
        required: true,
    },
    products: {
        type: [Products],
    },
    creditDays: {
        type: Number,
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
    approvedHistory: {
        type: [{
            date: { type: Date, default: Date.now },
            reason: { type: String },
            approvedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
        }],
        default: [],
    },
    rejectHistory: {
        type: [{
            date: { type: Date, default: Date.now },
            reason: { type: String },
            rejectedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }
        }],
        default: [],
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
})


export default model<supplierSchemaInterface>('Supplier', supplierSchema);