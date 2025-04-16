import { Schema } from "mongoose";

interface supplierSchemaInterface {
    supplierId : string;
    supplierName : string;
    address : string;
    supplierType : string;
    category : string;
    contactDetails : contactDetailsInterface[];
    documents ?: [];
    status : string;
    paymentTerms : string[];
    products : string[];
    creditDays : string;
    creditValue : number;
    createdDate : Date;
    updatedDate : Date;
    createdBy : string;
}

interface contactDetailsInterface {
    contactName : string;
    contactDesignation : string;
    contactNumber : string
}

const contactDetailsSchema = new Schema<contactDetailsInterface>({

})

const supplierSchema = new Schema<supplierSchemaInterface>({
    supplierId : {
        type: String,
        required: true,
    },
    supplierName : {
        type: String,
        required: true,
    },
    address: {
        type: String,
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
        type: [],
        required: true,
    },

})