import Employee from "../models/employee.model";

/** True when the employee can create purchase requests, through their role or an unexpired individual grant. */
export const canCreatePurchases = (employee: any): boolean => {
    if (employee?.category?.privileges?.purchase?.create === true) return true;
    const expiresAt = employee?.extraPrivilegesExpiresAt;
    const extraExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    return !extraExpired && employee?.extraPrivileges?.purchase?.create === true;
};

/** A job's purchase work can be handed to anyone who can create purchases, except a super admin. */
export const isPurchaseBuyer = (employee: any): boolean =>
    !!employee?.category && String(employee.category.role).toLowerCase() !== 'superadmin' && canCreatePurchases(employee);

const BUYER_SELECT = 'firstName lastName employeeId category extraPrivileges extraPrivilegesExpiresAt';

export const listPurchaseBuyers = async () => {
    const employees = await Employee.find({ isDeleted: { $ne: true }, isBlocked: { $ne: true } })
        .select(BUYER_SELECT)
        .populate('category', 'categoryName role privileges')
        .sort({ firstName: 1, lastName: 1 })
        .lean();
    return employees
        .filter((e: any) => isPurchaseBuyer(e))
        .map((e: any) => ({
            _id: e._id,
            firstName: e.firstName,
            lastName: e.lastName,
            employeeId: e.employeeId,
            category: { _id: e.category?._id, categoryName: e.category?.categoryName, role: e.category?.role },
        }));
};

export const findPurchaseBuyer = async (employeeId: string) => {
    const employee: any = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true }, isBlocked: { $ne: true } })
        .select(BUYER_SELECT)
        .populate('category', 'categoryName role privileges')
        .lean();
    return employee && isPurchaseBuyer(employee) ? employee : null;
};
