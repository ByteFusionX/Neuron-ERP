import { Schema, Document, model, Types } from "mongoose";

interface QuoteItemDetail {
    detail: string;
    quantity: number;
    unitCost: number;
    profit: number;
    availability: string;
    supplierName?: string;
    email?: string;
    phoneNo?: string;
    dealSelected?: boolean;
}

interface QuoteItem {
    itemName: string;
    itemDetails: QuoteItemDetail[]
}

interface OptionalItems {
    items: QuoteItem[];
    totalDiscount: number;
}

interface AdditionalCost {
    type: string;
    name: string;
    value: number;
}

interface Deal {
    dealId: string;
    paymentTerms: string;
    additionalCosts: AdditionalCost[];
    savedDate: Date;
    seenByApprover: boolean;
    status: string;
    approvedBy: Types.ObjectId;
    comments: string[];
    seenedBySalsePerson: boolean;
    attachments: [];
    updatedItems: QuoteItem[];
    totalDiscount:number;
}

interface Quotation extends Document {
    quoteId: string;
    client: Types.ObjectId;
    attention: Types.ObjectId;
    date: Date;
    department: Types.ObjectId;
    subject: string;
    currency: string;
    quoteCompany: string;
    optionalItems: OptionalItems[];
    customerNote: string;
    termsAndCondition: string;
    status: string;
    createdBy: Types.ObjectId;
    lpoFiles: [];
    dealData: Deal;
    enqId: Types.ObjectId;
    isDeleted: boolean;
    rfqNo: string;
    closingDate: Date;
    eventId: any;
}

export enum quoteStatus {
    WorkInProgress = 'Work In Progress',
    QuoteSubmitted = 'Quote Submitted',
    UnderNegotiation = 'Under negotiation',
    UnderReview = 'Under review',
    ReadyForSubmission = 'Ready for submission',
    Won = 'Won',
    Lost = 'Lost',
}

const quoteItemDetailsSchema = new Schema<QuoteItemDetail>({
    detail: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    unitCost: {
        type: Number,
        required: true,
    },
    profit: {
        type: Number,
        required: true,
    },
    availability: {
        type: String,
        required: true,
    },
    supplierName: {
        type: String,
        required: false,
    },
    email: {
        type: String,
        required: false,
    },
    phoneNo: {
        type: String,
        required: false,
    },
    dealSelected: {
        type: Boolean,
        required: false,
    }
});

const quoteItem = new Schema<QuoteItem>({
    itemName: {
        type: String,
        required: true,
    },
    itemDetails: {
        type: [quoteItemDetailsSchema],
        required: true,
    },
});

const optionalItems = new Schema<OptionalItems>({
    items: {
        type: [quoteItem],
    },
    totalDiscount: {
        type: Number,
    },
});

const additionalCostSchema = new Schema<AdditionalCost>({
    type: {
        type: String,
        enum: ['Additional Cost', 'Supplier Discount', 'Customer Discount']
    },
    name: {
        type: String,
    },
    value: {
        type: Number,
        required: true,
    }
});

const dealDatas = new Schema<Deal>({
    dealId: {
        type: String,
        required: false,
    },
    paymentTerms: {
        type: String,
        required: false,
    },
    additionalCosts: {
        type: [additionalCostSchema],
        required: false,
    },
    savedDate: {
        type: Date,
        required: false,
    },
    attachments: [],
    totalDiscount: {
        type: Number
    },
    seenByApprover: {
        type: Boolean,
        default: false
    },
    seenedBySalsePerson: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
    },
    comments: {
        type: [String],
    },
    updatedItems: {
        type: [quoteItem],
        required: true,
    },
});

const quotationSchema = new Schema<Quotation>({
    quoteId: {
        type: String,
        required: true,
        unique: true,
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
    },
    attention: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    department: {
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    currency: {
        type: String,
        required: true,
    },
    quoteCompany: {
        type: String,
    },
    optionalItems: {
        type: [optionalItems],
        required: true,
    },
    customerNote: {
        type: String,
        required: true,
    },
    termsAndCondition: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: Object.values(quoteStatus),
        default: quoteStatus.WorkInProgress,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
    lpoFiles: [],
    dealData: {
        type: dealDatas
    },
    enqId: {
        type: Schema.Types.ObjectId,
        ref: 'Enquiry'
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    closingDate: {
        type: Date,
        required: false,
    },
    eventId: {
        type: Schema.Types.ObjectId,
        ref: 'Event'
    },
});

export default model<Quotation>("Quotation", quotationSchema);
