import { NextFunction } from "express";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';

const TokenLogger = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.originalUrl.includes('login') || req.originalUrl.includes('uploads') || req.originalUrl.includes('employee/check') || req.header('Authorization')) {
            if (req.headers.authorization) {
                const token = req.header('Authorization')?.replace('Bearer ', '');
                const jwtVerified = jwt.verify(token, process.env.JWT_SECRET);
                if (jwtVerified) {
                    next()
                }
            } else {
                next()
            }
        } else {
            return res.status(401).json({ error: 'Authorization token is missing' })
        }
    } catch (error) {
        console.log(error)
next(error)
    }
}

export default TokenLogger 