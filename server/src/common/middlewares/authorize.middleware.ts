import { Request, Response, NextFunction } from "express";
import Employee from "../../models/employee.model";
import { Privileges } from "../../models/category.model";

type ModulePrivileges = Omit<Privileges, 'dealSheet'>;
type Module = keyof ModulePrivileges;
type Action<M extends Module> = keyof ModulePrivileges[M];

export const authorize = <M extends Module>(
    module: M,
    action: Action<M> | ((req: Request) => Action<M>)
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.employeeId) {
                return res.status(401).json({ authError: true });
            }

            const employee = await Employee.findById(req.employeeId).populate('category');
            const category: any = employee?.category;

            const resolvedAction = typeof action === 'function' ? action(req) : action;
            const isAllowed = !!category?.privileges?.[module]?.[resolvedAction as string];

            if (!isAllowed) {
                return res.status(403).json({ forbiddenError: true });
            }

            return next();
        } catch (error) {
            console.log(error);
            next(error);
        }
    };
};
