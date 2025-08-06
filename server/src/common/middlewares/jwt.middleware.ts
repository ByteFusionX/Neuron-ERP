import { NextFunction } from "express";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import Employee from "../../models/employee.model";

const TokenLogger = async (req: any, res: Response, next: NextFunction) => {
    if (req.originalUrl.includes('login') || req.originalUrl.includes('uploads') || req.originalUrl.includes('employee/check') || req.originalUrl.includes('employee/refresh-token')) {
        return next();
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.sendStatus(401);
    
    try {
        const decoded = <{ id: string, employeeId: string }>jwt.verify(token, process.env.ACCESS_SECRET);
        const user = await Employee.findById(decoded.id);

        const INACTIVITY_LIMIT = 4 * 60 * 60 * 1000; 

        if (Date.now() - user.lastActivity > INACTIVITY_LIMIT) {
            return res.status(403).json({ message: 'Session expired due to inactivity' });
        }

        user.lastActivity = Date.now();
        await user.save();

        req.user = user;
        return next();
    } catch (err) {
        return res.sendStatus(403);
    }
}

export default TokenLogger 