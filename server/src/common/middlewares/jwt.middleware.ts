import { NextFunction } from "express";
import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import passport from 'passport';
import Employee from "../../models/employee.model";

declare global {
    namespace Express {
        interface Request {
            employeeId?: string;
        }
    }
}

// Local tokens (see legacyLogin) are signed HS256 against JWT_SECRET; Microsoft/Azure AD
// tokens are RS256 and get verified against Microsoft's published keys. Reading just the
// header tells us which verification path to use without attempting either one first.
const getTokenAlgorithm = (token: string): string | undefined => {
    try {
        const [headerSegment] = token.split('.');
        const header = JSON.parse(Buffer.from(headerSegment, 'base64').toString('utf8'));
        return header?.alg;
    } catch {
        return undefined;
    }
};

const TokenLogger = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (
            req.originalUrl.includes('uploads') ||
            req.originalUrl.includes('employee/legacy-auth') ||
            req.originalUrl.includes('login') ||
            req.originalUrl.includes('employee/check')
        ) {
            return next();
        }

        const authHeader = req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        const algorithm = token ? getTokenAlgorithm(token) : undefined;

        if (token && algorithm === 'HS256') {
            try {
                const jwtVerified = <{ id: string, employeeId: string }>jwt.verify(token, process.env.JWT_SECRET);
                const employee = await Employee.findOne(
                    { _id: jwtVerified.id, isDeleted: { $ne: true }, isBlocked: { $ne: true } },
                    { password: 0 }
                );

                if (!employee) {
                    return res.status(401).json({ error: 'Invalid token' });
                }

                req.employeeId = employee._id.toString();
                return next();
            } catch (jwtError) {
                if (jwtError.name === 'TokenExpiredError') {
                    return res.status(401).json({ error: 'Token has expired' });
                } else if (jwtError.name === 'JsonWebTokenError') {
                    return res.status(401).json({ error: 'Invalid token' });
                }
                return res.status(401).json({ error: 'Token verification failed' });
            }
        }

        // No token, an unparseable header, or an RS256 (Microsoft) token — verify against Azure AD.
        return passport.authenticate('oauth-bearer', { session: false }, (err: any, user: any) => {
            if (err || !user || !user._id) {
                return res.status(401).json({ error: 'Token verification failed' });
            }
            req.employeeId = user._id.toString();
            return next();
        })(req, res, next);
    } catch (error) {
        console.log(error)
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export default TokenLogger
