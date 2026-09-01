// One-time migration: pre-creates every document-numbering Counter so the atomic
// getNextSequence() path never has to lazily seed a counter under live traffic.
//
// Run this once, before deploying the atomic-counter numbering changes, with no
// concurrent traffic hitting the create/generate endpoints for these modules:
//
//   npx ts-node src/scripts/seedCounters.ts
//
// Safe to re-run: each counter is written with $setOnInsert, so an existing counter
// document is left untouched and only missing ones are created.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { connectToDatabase, disconnectFromDatabase } from '../db/connect';
import Counter from '../models/counter.model';
import { Invoice } from '../models/invoice.model';
import GRN from '../models/grn.model';
import PurchaseOrder from '../models/purchaseOrder.model';
import PurchaseRequest from '../models/purchaseRequest.model';
import DeliveryNote from '../models/deliveryNote.model';
import enquiryModel from '../models/enquiry.model';
import Quotation from '../models/quotation.model';
import Job from '../models/job.model';
import Customer from '../models/customer.model';
import StockEntry from '../models/stockEntry.model';
import Supplier from '../models/supplier.model';

const seedInvoiceNumber = async (): Promise<number> => {
    const invoices = await Invoice.find({ isDeleted: false }).select('invoiceNo').lean();
    let maxNum = 0;
    for (const inv of invoices) {
        const match = (inv.invoiceNo || '').match(/^INV-(\d+)/);
        if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
    }
    return maxNum;
};

const seedGRNSequence = async (prefix: string): Promise<number> => {
    const lastEntry = await GRN.findOne({ grnNo: new RegExp(`^${prefix}`) }).sort({ createdAt: -1 });
    if (lastEntry && lastEntry.grnNo) {
        const parts = lastEntry.grnNo.split('-');
        if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
            return parseInt(parts[2]);
        }
    }
    return 0;
};

const seedLpoSequence = async (year: string): Promise<number> => {
    const lastOrder = await PurchaseOrder.findOne(
        { poNo: { $regex: `^NTP-LP-\\d{4}-${year}$` } }
    ).sort({ poNo: -1 });
    if (lastOrder && lastOrder.poNo) {
        const parts = lastOrder.poNo.split('-');
        if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
            return parseInt(parts[2]);
        }
    }
    return 0;
};

const seedPurchaseNoSequence = async (): Promise<number> => {
    const latestPR = await PurchaseRequest.findOne().sort({ purchaseNo: -1 });
    if (latestPR) {
        const parts = latestPR.purchaseNo.split('-');
        const lastCounter = parseInt(parts[3]);
        if (!isNaN(lastCounter)) {
            return lastCounter;
        }
    }
    return 0;
};

const seedDnSequence = async (): Promise<number> => {
    const lastDn = await DeliveryNote.findOne().sort({ createdDate: -1 });
    if (lastDn && lastDn.dnNo) {
        const matches = lastDn.dnNo.match(/DN-(\d+)/);
        if (matches && matches[1]) {
            return parseInt(matches[1], 10);
        }
    }
    return 0;
};

const seedEnquiryIdSequence = async (): Promise<number> => {
    const lastEnquiry = await enquiryModel.aggregate([
        { $match: { enquiryId: { $exists: true } } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ['$enquiryId', '-'] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastEnquiry.length ? parseInt(lastEnquiry[0].lastNumber) : 0;
};

const seedQuoteIdSequence = async (): Promise<number> => {
    const lastQuote = await Quotation.aggregate([
        { $match: { quoteId: { $exists: true } } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ['$quoteId', '-'] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastQuote.length ? parseInt(lastQuote[0].lastNumber) : 0;
};

const seedDealIdSequence = async (): Promise<number> => {
    const lastQuote = await Quotation.aggregate([
        { $match: { dealData: { $exists: true } } },
        { $addFields: { lastNumber: { $toInt: { $arrayElemAt: [{ $split: ['$dealData.dealId', '-'] }, -1] } } } },
        { $sort: { lastNumber: -1 } },
        { $limit: 1 }
    ]);
    return lastQuote.length ? parseInt(lastQuote[0].lastNumber) : 0;
};

const seedJobIdSequence = async (): Promise<number> => {
    const lastJob = await Job.findOne({}, {}, { sort: { jobId: -1 } });
    if (lastJob && lastJob.jobId) {
        const parts = lastJob.jobId.split('-');
        const lastNum = parseInt(parts[1]);
        if (!isNaN(lastNum)) {
            return lastNum;
        }
    }
    return 99; // legacy default: numbering historically started at 0100
};

const seedClientRefSequence = async (): Promise<number> => {
    const lastClientId = await Customer.aggregate([
        { $match: { clientRef: { $ne: null } } },
        { $addFields: { slNoString: { $regexFind: { input: '$clientRef', regex: '^[0-9]+' } } } },
        { $addFields: { slNo: { $toInt: '$slNoString.match' } } },
        { $sort: { slNo: -1 } },
        { $limit: 1 }
    ]);
    return lastClientId.length ? lastClientId[0].slNo : 0;
};

const seedSupplierIdSequence = async (deptCode: string): Promise<number> => {
    const lastSupplier = await Supplier.findOne({
        supplierId: { $regex: `^NT-SP-${deptCode}-\\d{3}$` }
    }).sort({ supplierId: -1 });
    if (lastSupplier?.supplierId) {
        const lastSequence = parseInt(lastSupplier.supplierId.split('-')[3], 10);
        if (!isNaN(lastSequence)) {
            return lastSequence;
        }
    }
    return 0;
};

const seedCounter = async (key: string, computeSeed: () => Promise<number>) => {
    const existing = await Counter.findById(key);
    if (existing) {
        console.log(`exists  ${key.padEnd(24)} seq=${existing.seq}`);
        return;
    }
    const seed = await computeSeed();
    const created = await Counter.findOneAndUpdate(
        { _id: key },
        { $setOnInsert: { seq: seed } },
        { upsert: true, new: true }
    );
    console.log(`seeded  ${key.padEnd(24)} seq=${created.seq}`);
};

const run = async () => {
    await connectToDatabase();

    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const currentYear = now.getFullYear();

    await seedCounter('invoiceNo', seedInvoiceNumber);
    await seedCounter(`grnNo-${currentYear}`, () => seedGRNSequence(`GRN-${currentYear}`));
    await seedCounter(`poNo-${yy}`, () => seedLpoSequence(yy));
    await seedCounter('purchaseNo', seedPurchaseNoSequence);
    await seedCounter('dnNo', seedDnSequence);
    await seedCounter('enquiryId', seedEnquiryIdSequence);
    await seedCounter('quoteId', seedQuoteIdSequence);
    await seedCounter('dealId', seedDealIdSequence);
    await seedCounter('jobId', seedJobIdSequence);
    await seedCounter('clientRef', seedClientRefSequence);

    // Supplier ID counters are scoped per department, so there is no single global
    // key to pre-seed; each department's key is created lazily on its first use
    // instead (low-traffic module, narrow window, acceptable).
    void seedSupplierIdSequence;

    await disconnectFromDatabase();
};

run().catch(async (err) => {
    console.error('Seed counters failed:', err);
    await disconnectFromDatabase();
    process.exit(1);
});
