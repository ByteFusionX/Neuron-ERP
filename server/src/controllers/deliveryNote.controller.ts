import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DeliveryNote from '../models/deliveryNote.model';
import Job from '../models/job.model';
// Might need to import other models if we need to update stock/inventory 

export const generateDnNumber = async (req: Request, res: Response) => {
    try {
        const lastDn = await DeliveryNote.findOne().sort({ createdDate: -1 });
        let nextNum = 1;
        if (lastDn && lastDn.dnNo) {
            const matches = lastDn.dnNo.match(/DN-(\d+)/);
            if (matches && matches[1]) {
                nextNum = parseInt(matches[1], 10) + 1;
            }
        }
        const dnNumber = `DN-${String(nextNum).padStart(4, '0')}`;
        res.status(200).json({ dnNumber });
    } catch (error) {
        res.status(500).json({ message: 'Error generating DN Number', error });
    }
};

export const createDn = async (req: Request, res: Response) => {
    try {
        const { dnNo, dnDate, jobId, items } = req.body;

        // 1. Create DN
        const newDn = new DeliveryNote({
            ...req.body,
            createdBy: (req as any).user?._id
        });
        const savedDn = await newDn.save();

        // 2. Update Job Status if needed (logic: check if all items delivered)?

        res.status(201).json({ success: true, data: savedDn });
    } catch (error) {
        console.error("Create DN Error:", error);
        res.status(500).json({ message: 'Error creating Delivery Note', error });
    }
};

export const getDnsByJobId = async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const dns = await DeliveryNote.find({ jobId }).sort({ dnDate: -1 });
        res.status(200).json(dns);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching DNs', error });
    }
};

export const getAllDeliveryNotes = async (req: Request, res: Response) => {
    try {
        let { page, search, row, jobId, customer, fromDate, toDate, status } = req.body;
        let skipNum: number = (page - 1) * row;

        let searchRegex = search ? search.split('').join('\\s*') : '';

        let isJob = jobId == null ? true : false;
        let isCustomer = customer == null ? true : false;
        let isDate = fromDate == null || toDate == null ? true : false;
        let isStatus = status == null ? true : false;

        let matchFilters = {
            $and: [
                ...(status ? [{ status: status }] : []),
                ...(jobId ? [{ jobId: new mongoose.Types.ObjectId(jobId) }] : []),
                ...(customer ? [{ clientName: { $regex: customer, $options: 'i' } }] : []),
                { dnNo: { $regex: search || '', $options: 'i' } },
                {
                    $or: [
                        { $and: [{ dnDate: { $gte: new Date(fromDate) } }, { dnDate: { $lte: new Date(toDate) } }] },
                        { dnDate: { $exists: isDate } }
                    ]
                }
            ]
        };

        let total: number = 0;
        await DeliveryNote.aggregate([
            { $match: matchFilters },
            { $count: "total" }
        ]).exec().then((result: any) => {
            if (result && result.length > 0) {
                total = result[0].total;
            }
        });

        let dns = await DeliveryNote.aggregate([
            { $match: matchFilters },
            { $sort: { dnDate: -1 } },
            { $skip: skipNum },
            { $limit: row },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: '$job' },

            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } }
        ]);

        if (!dns || !total) return res.status(200).json({ total: 0, dns: [] });
        return res.status(200).json({ total: total, dns: dns });

    } catch (error) {
        console.error("Get All DNs Error:", error);
        res.status(500).json({ message: 'Error fetching DNs', error });
    }
};

export const getDnById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dn = await DeliveryNote.findById(id)
            .populate('jobId', 'jobId projectName')
            .populate('createdBy', 'firstName lastName');

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        return res.status(200).json(dn);
    } catch (error) {
        console.error("Get DN by ID Error:", error);
        res.status(500).json({ message: 'Error fetching DN', error });
    }
};

export const cancelDn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dn = await DeliveryNote.findById(id);

        if (!dn) {
            return res.status(404).json({ message: 'Delivery Note not found' });
        }

        if (dn.status === 'Cancelled') {
            return res.status(400).json({ message: 'Delivery Note is already cancelled' });
        }

        if (dn.status === 'Delivered') {
            return res.status(400).json({ message: 'Cannot cancel a delivered DN' });
        }

        dn.status = 'Cancelled';
        await dn.save();

        return res.status(200).json({ message: 'Delivery Note cancelled successfully', dn });
    } catch (error) {
        console.error("Cancel DN Error:", error);
        res.status(500).json({ message: 'Error cancelling DN', error });
    }
};
