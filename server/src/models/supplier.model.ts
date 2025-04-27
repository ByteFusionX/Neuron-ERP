import { model, Schema, Types } from "mongoose";

interface supplierSchemaInterface {
    supplierId: string;
    supplierName: string;
    address: AddressInterface;
    supplierType: String;
    category: string;
    contactDetails: contactDetailsInterface[];
    documents?: any[];
    status: supplierStatus;
    products: ProductsInterface[];
    creditDays: number;
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

interface ProductsInterface {
    products: string;
    name: string;
    email: string;
    phone: string;
    paymentTerms: string;
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

const Products = new Schema<ProductsInterface>({
    products: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    paymentTerms: {
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
        enum: Object.values(supplierStatus),
        default: supplierStatus.pending,
        required: true,
    },
    products: {
        type: [Products],
        required: true,
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
    approvedDate: {
        type: Date,
        default: Date.now,
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },

})


export default model<supplierSchemaInterface>('Supplier', supplierSchema);