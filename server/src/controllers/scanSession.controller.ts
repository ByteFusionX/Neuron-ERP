import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import ScanSession from "../models/scanSession.model";
import { getEmployeeData } from "../common/utils/util";

export const createScanSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { supplier, product, reference } = req.body;

        const employeeData = await getEmployeeData(req.user);
        if (!employeeData) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const session = new ScanSession({
            sessionId: crypto.randomUUID(),
            supplier: supplier || undefined,
            product: product || undefined,
            reference: reference || undefined,
            createdBy: employeeData._id,
            scans: [],
            status: 'active',
        });

        const saved = await session.save();
        return res.status(200).json(saved);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const getScanSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;

        const session = await ScanSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ message: 'Scan session not found' });
        }

        return res.status(200).json(session);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const appendScan = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ message: 'A scanned code is required' });
        }

        const session = await ScanSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ message: 'Scan session not found' });
        }

        if (session.status !== 'active') {
            return res.status(409).json({ message: 'Scan session is closed' });
        }

        const scan = {
            code,
            order: session.scans.length + 1,
            scannedAt: new Date(),
        };

        session.scans.push(scan as any);
        await session.save();

        const io = req.app.get('io');
        if (io) {
            io.to(sessionId).emit('scanAdded', { sessionId, scan });
        }

        return res.status(200).json(scan);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const closeScanSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params;

        const session = await ScanSession.findOneAndUpdate(
            { sessionId },
            { status: 'closed' },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ message: 'Scan session not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(sessionId).emit('scanSessionClosed', { sessionId });
        }

        return res.status(200).json(session);
    } catch (error) {
        console.log(error);
        next(error);
    }
};
