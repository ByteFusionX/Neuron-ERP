import { NextFunction } from "express";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import passport from 'passport';
import Employee from "../../models/employee.model";

const TokenLogger = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (req.originalUrl.includes('login') || req.originalUrl.includes('uploads') || req.originalUrl.includes('employee/check')) {
            return next();
        }

        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization token is missing' });
        }

        const token = authHeader.replace('Bearer ', '');

        try {
            const jwtVerified = <{ id: string, employeeId: string }>jwt.verify(token, process.env.JWT_SECRET);
            const employee = await Employee.findOne(
                { _id: jwtVerified.id, isDeleted: { $ne: true } },
                { password: 0 }
            ).populate('category');

            if (!employee) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            req.user = employee;
            return next();
        } catch (jwtError) {
            // Not one of our own JWTs — fall back to a Microsoft/Azure AD bearer token
            return passport.authenticate('oauth-bearer', { session: false }, (err: any, user: any) => {
                if (err || !user || !user._id) {
                    if (jwtError.name === 'TokenExpiredError') {
                        return res.status(401).json({ error: 'Token has expired' });
                    } else if (jwtError.name === 'JsonWebTokenError') {
                        return res.status(401).json({ error: 'Invalid token' });
                    }
                    return res.status(401).json({ error: 'Token verification failed' });
                }
                req.user = user;
                return next();
            })(req, res, next);
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export default TokenLogger
