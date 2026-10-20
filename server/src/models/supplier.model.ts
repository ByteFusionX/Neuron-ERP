import { model, Schema, Types } from "mongoose";

interface supplierSchemaInterface {
    supplierId: string;
    supplierName: string;
    nameKey?: string;
    nameCore?: string;
    emailKey?: string;
    phoneKey?: string;
    emailKeys?: string[];
    phoneKeys?: string[];
    companyEmail?: string;
    companyPhone?: string;
    website?: string;
    ibanKey?: string;
    ibanKeys?: string[];
    address: AddressInterface;
    supplierType: String;
    category: Types.ObjectId;
    contactDetails: contactDetailsInterface;
    // Every contact person; `contactDetails` mirrors the primary one so older readers keep working.
    contacts: SupplierContactInterface[];
    // Every address; `address` mirrors the first one.
    addresses: AddressInterface[];
    // Every bank account; `bankDetails` mirrors the primary one so older readers keep working.
    bankAccounts?: BankDetailsInterface[];
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
    blockHistory?: { date: Date; blocked: boolean; reason?: string; byName?: string }[];
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
interface SupplierContactInterface extends contactDetailsInterface {
    designation?: string;
    isPrimary: boolean;
}
interface AddressInterface {
    label?: string;
    isPrimary?: boolean;
    streetNo: string;
    buildingNo: string;
    zoneNo: string;
    poBox: string;
    city: string;
    location: string;
}

interface BankDetailsInterface {
    isPrimary?: boolean;
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

const supplierContactSchema = new Schema<SupplierContactInterface>({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    designation: { type: String, default: '' },
    isPrimary: { type: Boolean, default: false },
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
    label: String,
    isPrimary: { type: Boolean, default: false },
    streetNo: String,
    buildingNo: String,
    zoneNo: String,
    poBox: String,
    location: String,
    city: String,
})

const BankDetails = new Schema<BankDetailsInterface>({
    isPrimary: { type: Boolean, default: false },
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
        unique: true,
        sparse: true,
    },
    supplierName: {
        type: String,
        required: true,
    },
    // Derived from name, contact and bank details for duplicate checks (common/utils/partyMatch.ts).
    nameKey: { type: String, index: true },
    nameCore: { type: String, index: true },
    // `emailKey`/`phoneKey` are the old single-contact keys; `emailKeys`/`phoneKeys` cover the company and every contact.
    emailKey: { type: String, index: true },
    phoneKey: { type: String, index: true },
    emailKeys: { type: [String], index: true },
    phoneKeys: { type: [String], index: true },
    companyEmail: { type: String, default: '' },
    companyPhone: { type: String, default: '' },
    website: { type: String, default: '' },
    ibanKey: { type: String, index: true },
    ibanKeys: { type: [String], index: true },
    address: {
        type: Address,
    },
    supplierType: {
        type: String,
        required: true,
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'MasterListItem',
        required: true,
    },
    contactDetails: {
        type: contactDetailsSchema,
        required: true,
    },
    contacts: {
        type: [supplierContactSchema],
        default: [],
    },
    addresses: {
        type: [Address],
        default: [],
    },
    bankAccounts: {
        type: [BankDetails],
        default: [],
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
        // Approval step is switched off for now: new suppliers start as Approved.
        default: supplierStatus.approved,
        required: true,
    },
    products: {
        type: [Products],
    },
    creditDays: {
        type: Number,
        default: 0,
    },
    creditValue: {
        type: Number,
        default: 0,
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
    blockHistory: {
        type: [{
            date: { type: Date, default: Date.now },
            blocked: { type: Boolean },
            reason: { type: String },
            byName: { type: String }
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