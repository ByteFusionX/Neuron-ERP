import mongoose from 'mongoose';
import { CreditNote } from '../models/creditNote.model';
import { getNextSequence } from '../models/counter.model';

const seedCreditNoteSequence = (prefix: string) => async (): Promise<number> => {
    const lastEntry = await CreditNote.findOne({
        creditNoteNo: new RegExp(`^${prefix}`)
    }).sort({ createdAt: -1 });

    if (lastEntry && (lastEntry as any).creditNoteNo) {
        const parts = (lastEntry as any).creditNoteNo.split('-');
        if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
            return parseInt(parts[2]);
        }
    }
    return 0;
};

export interface CreateCreditNoteInput {
    invoiceId: string;
    dnId?: string;
    jobId?: string;
    customer?: string;
    items: {
        itemId?: string;
        description?: string;
        rejectedQty: number;
        unitPrice: number;
        amount: number;
    }[];
    totalAmount: number;
    reason: string;
    createdBy?: string;
}

/**
 * Creates a CreditNote reconciling a customer rejection against an invoice.
 * Not exposed as a standalone route in v1 — invoked directly from the
 * invoice rejection flow (see rejectInvoiceByCustomer).
 */
export const createCreditNote = async (input: CreateCreditNoteInput) => {
    const currentYear = new Date().getFullYear();
    const prefix = `CN-${currentYear}`;
    const sequence = await getNextSequence(`creditNoteNo-${currentYear}`, seedCreditNoteSequence(prefix));
    const creditNoteNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;

    const creditNoteData: any = {
        creditNoteNo,
        invoiceId: input.invoiceId,
        items: input.items,
        totalAmount: input.totalAmount,
        reason: input.reason
    };

    if (input.dnId && mongoose.Types.ObjectId.isValid(input.dnId)) {
        creditNoteData.dnId = input.dnId;
    }
    if (input.jobId && mongoose.Types.ObjectId.isValid(input.jobId)) {
        creditNoteData.jobId = input.jobId;
    }
    if (input.customer && mongoose.Types.ObjectId.isValid(input.customer)) {
        creditNoteData.customer = input.customer;
    }
    if (input.createdBy && mongoose.Types.ObjectId.isValid(input.createdBy)) {
        creditNoteData.createdBy = input.createdBy;
    }

    const creditNote = new CreditNote(creditNoteData);
    await creditNote.save();
    return creditNote;
};
