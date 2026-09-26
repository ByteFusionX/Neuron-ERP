import { Router } from "express";
import { createCategory, getCategory, updateCategory, deleteCategory } from "../controllers/category.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
import { NextFunction, Response } from "express";
const catRouter = Router()

// Stops a non-admin from widening or deleting the role they hold themselves (privilege escalation).
const notOwnRole = (getId: (req: any) => string | undefined) => (req: any, res: Response, next: NextFunction) => {
    const role = req.employee?.category?.role;
    if (role === "admin" || role === "superAdmin") return next();
    const own = req.employee?.category?._id?.toString();
    if (own && own === getId(req)?.toString()) {
        return res.status(403).json({ message: "You cannot change your own role" });
    }
    return next();
};

// GET stays open: the role list also feeds the employee form's role dropdown.
// Mutations need the matching Roles & Privileges flag.
catRouter.get('/', getCategory)
catRouter.post('/', requirePrivilege("roles", "create"), createCategory)
catRouter.patch('/:categoryId', requirePrivilege("roles", "edit"), notOwnRole((r) => r.params.categoryId), updateCategory)
catRouter.post('/delete', requirePrivilege("roles", "delete"), notOwnRole((r) => r.body?.dataId), deleteCategory)

export default catRouter;
