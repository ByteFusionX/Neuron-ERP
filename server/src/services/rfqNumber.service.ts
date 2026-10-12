import Rfq from "../models/rfq.model";
import { getNextSequence } from "../models/counter.model";

// RFQ numbers are shared by the purchase and sales flows, so the counter lives outside both controllers.
const seedRfqNoSequence = async (): Promise<number> => {
    const latest = await Rfq.findOne().sort({ rfqNo: -1 });
    if (!latest) return 0;
    const lastCounter = parseInt(String(latest.rfqNo).split('-').pop() || '', 10);
    return Number.isNaN(lastCounter) ? 0 : lastCounter;
};

export const nextRfqNo = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const nextNumber = await getNextSequence('rfqNo', seedRfqNoSequence);
    return `NRN/RFQ-${year}-${month}-${nextNumber.toString().padStart(4, '0')}`;
};
