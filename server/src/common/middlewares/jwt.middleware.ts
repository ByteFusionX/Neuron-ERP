
import passport from "passport";
import jwt from "jsonwebtoken";
import Employee from "../../models/employee.model";

// Azure AD bearer auth is disabled; the app uses its own JWT (employeeId/password login).
// const PassportMiddleware = (req: any, res: any, next: any) => {
//     if (req.path.includes('/uploads')) {
//         return next();
//     }
//     return passport.authenticate('oauth-bearer', { session: false })(req, res, next);
// }

const EXEMPT_PATHS = ['/uploads', '/employee/login', '/employee/login-microsoft', '/employee/check', '/employee/refresh', '/employee/logout'];

// Phone scanning a QR code is never logged in; the scan session id itself (unguessable,
// only ever shared via the QR) is the security boundary for this one read-only lookup.
const isPublicScanSessionRead = (req: any) => req.method === 'GET' && /^\/scan-session\/[^/]+$/.test(req.path);

const PassportMiddleware = async (req: any, res: any, next: any) => {
    if (EXEMPT_PATHS.some((path) => req.path.includes(path)) || isPublicScanSessionRead(req)) {
        return next();
    }

    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET as string);
        // A blocked or deleted employee loses access immediately, not when the token expires.
        const active = await Employee.exists({ _id: decoded?.id, isDeleted: { $ne: true }, isBlocked: { $ne: true } });
        if (!active) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.user = decoded;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

export default PassportMiddleware
