import { Request, Response } from "express";
import Counter from '../models/counter.model';

// Series with a single fixed counter key. Enquiry, GRN, LPO etc. have per-year/department
// keys and are not listed here.
const SERIES = [
    { key: 'clientRef', label: 'Customer', format: '{seq:3}-{year}', example: '012-26' },
    { key: 'quoteId', label: 'Quotation', format: 'QN-NT/{sales}/{dept}-{date}-{seq:3}', example: 'QN-NT/AB/SLS-240926-007' },
    { key: 'dealId', label: 'Deal sheet', format: 'DL-{year}-{seq:3}', example: 'DL-2026-004' },
    { key: 'jobId', label: 'Job sheet', format: '{date}-{seq:4}', example: '240926-0012' },
];

export const getNumberingSeries = async (req: Request, res: Response) => {
    try {
        const counters = await Counter.find({ _id: { $in: SERIES.map(s => s.key) } });
        const data = SERIES.map(s => {
            const last = counters.find(c => c._id === s.key)?.seq ?? 0;
            return { ...s, lastNumber: last, nextNumber: last + 1 };
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Error fetching numbering series:', error);
        return res.status(500).json({ success: false, message: "Failed to fetch numbering" });
    }
};

// Sets the next number to issue. Only allowed to move forward so numbers are never reused.
export const setNextNumber = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        if (!SERIES.some(s => s.key === key)) {
            return res.status(400).json({ success: false, message: "Invalid series" });
        }
        const next = Number(req.body.nextNumber);
        if (!Number.isInteger(next) || next < 1) {
            return res.status(400).json({ success: false, message: "Next number must be a whole number of 1 or more" });
        }
        const existing = await Counter.findById(key);
        const last = existing?.seq ?? 0;
        if (next <= last) {
            return res.status(400).json({ success: false, message: `Next number must be higher than the last issued number (${last})` });
        }
        await Counter.findOneAndUpdate({ _id: key }, { $set: { seq: next - 1 } }, { upsert: true });
        return res.status(200).json({ success: true, data: { key, lastNumber: next - 1, nextNumber: next } });
    } catch (error) {
        console.error('Error setting next number:', error);
        return res.status(500).json({ success: false, message: "Failed to update numbering" });
    }
};
