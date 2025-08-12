import { NextFunction } from "express";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';

const TokenLogger = (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.originalUrl.includes('login') || req.originalUrl.includes('uploads') || req.originalUrl.includes('employee/check') || req.header('Authorization')) {
            if (req.headers.authorization) {
                const token = req.header('Authorization')?.replace('Bearer ', '');
                try {
                    const jwtVerified = jwt.verify(token, process.env.JWT_SECRET);
                    if (jwtVerified) {
                        next()
                    }
                } catch (jwtError) {
                    if (jwtError.name === 'TokenExpiredError') {
                        return res.status(401).json({ error: 'Token has expired' });
                    } else if (jwtError.name === 'JsonWebTokenError') {
                        return res.status(401).json({ error: 'Invalid token' });
                    } else {
                        return res.status(401).json({ error: 'Token verification failed' });
                    }
                }
            } else {
                next()
            }
        } else {
            return res.status(401).json({ error: 'Authorization token is missing' })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export default TokenLogger 