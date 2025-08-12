
import passport from "passport";

const PassportMiddleware = (req: any, res: any, next: any) => {
    if (req.path.includes('/login') || req.path.includes('/uploads')) {
        return next();
    }
    return passport.authenticate('oauth-bearer', { session: false })(req, res, next);
}

export default PassportMiddleware