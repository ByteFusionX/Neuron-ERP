
import passport from "passport";
import jwt from "jsonwebtoken";

// Azure AD login is temporarily disabled in favor of employeeId/password login.
// To re-enable Azure, restore this block and remove the JWT block below.
// const PassportMiddleware = (req: any, res: any, next: any) => {
//     if (req.path.includes('/uploads')) {
//         return next();
//     }
//     return passport.authenticate('oauth-bearer', { session: false })(req, res, next);
// }

const EXEMPT_PATHS = ['/uploads', '/employee/login', '/employee/check'];

// Phone scanning a QR code is never logged in; the scan session id itself (unguessable,
// only ever shared via the QR) is the security boundary for this one read-only lookup.
const isPublicScanSessionRead = (req: any) => req.method === 'GET' && /^\/scan-session\/[^/]+$/.test(req.path);

const PassportMiddleware = (req: any, res: any, next: any) => {
    if (EXEMPT_PATHS.some((path) => req.path.includes(path)) || isPublicScanSessionRead(req)) {
        return next();
    }

    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        req.user = decoded;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

export default PassportMiddleware
