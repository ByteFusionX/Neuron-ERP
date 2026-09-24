import { Request, Response, NextFunction } from "express";
import Department from '../models/department.model'
import Employee from '../models/employee.model'
import Customer from '../models/customer.model'
import Enquiry from '../models/enquiry.model'
import internalDepartment from "../models/internal.department";
import { getAllReportedEmployees } from "../common/utils/util";
const { ObjectId } = require('mongodb')
import { newTrash } from '../controllers/trash.controller'


// Picks only the listed fields the client actually sent, so partial updates never wipe data.
const optionalFields = (data: any, keys: string[]) =>
    Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]))

const groupCount = async (model: any, field: string, extra: Record<string, any> = {}) => {
    const rows = await model.aggregate([
        { $match: { isDeleted: { $ne: true }, [field]: { $ne: null }, ...extra } },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } }
    ])
    return new Map<string, number>(rows.map((r: any) => [String(r._id), r.count]))
}

// Read-only: how many live records reference each department, keyed by department id.
export const getDepartmentUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [customers, enquiries, employees] = await Promise.all([
            groupCount(Customer, 'department'),
            groupCount(Enquiry, 'department'),
            groupCount(Employee, 'department'),
        ])
        const contacts = new Map<string, number>()
        const contactRows = await Customer.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            { $unwind: '$contactDetails' },
            { $match: { 'contactDetails.department': { $ne: null } } },
            { $group: { _id: '$contactDetails.department', count: { $sum: 1 } } }
        ])
        contactRows.forEach((r: any) => contacts.set(String(r._id), r.count))
        const obj = (m: Map<string, number>) => Object.fromEntries(m)
        return res.status(200).json({
            customers: obj(customers), enquiries: obj(enquiries), contacts: obj(contacts), employees: obj(employees)
        })
    } catch (error) {
        console.log(error)
        next(error)
    }
}

const salesDepartmentInUse = async (id: string) => {
    const [customers, enquiries] = await Promise.all([
        Customer.countDocuments({ department: id, isDeleted: { $ne: true } }),
        Enquiry.countDocuments({ department: id, isDeleted: { $ne: true } }),
    ])
    return { customers, enquiries }
}

export const getDepartments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departments = await Department.aggregate([
            {
                $match: {
                    forCustomerContact: false,
                    isDeleted: { $ne: true },
                    ...(req.query.activeOnly === 'true' ? { isActive: { $ne: false } } : {})
                },
            },
            {
                $lookup: {
                    from: 'employees', localField: 'departmentHead',
                    foreignField: '_id', as: 'departmentHead'
                }
            },
        ])

        if (departments.length > 0) {
            return res.status(200).json(departments);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const createDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departmentData = req.body

        const existingDeleted = await Department.findOne({
            departmentName: departmentData.departmentName,
            forCustomerContact: departmentData.forCustomerContact,
            isDeleted: true
        })

        if (existingDeleted) {
            const revivedDepartment = await Department.findOneAndUpdate(
                { _id: existingDeleted._id },
                {
                    $set: {
                        departmentHead: departmentData.departmentHead,
                        isDeleted: false
                    }
                },
                { new: true }
            ).populate(['departmentHead'])

            return res.status(200).json({
                ...revivedDepartment.toObject(),
                message: 'Department already existed, renewed'
            })
        }

        const department = new Department(departmentData)
        const saveDepartment = await (await department.save()).populate(['departmentHead'])

        if (saveDepartment) {
            return res.status(200).json(saveDepartment)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}


export const updateDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body
        let department = await Department.findOneAndUpdate({ _id: data._id }, { $set: { departmentName: data.departmentName, departmentHead: data.departmentHead, ...optionalFields(data, ['code', 'isActive', 'salesTarget']) } })

        if (department) {
            department = await (await Department.findOne({ _id: department._id })).populate('departmentHead')
            return res.status(200).json(department)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}


export const getCustomerDepartments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departments = await Department.aggregate([
            {
                $match: {
                    forCustomerContact: true,
                    isDeleted: { $ne: true },
                    ...(req.query.activeOnly === 'true' ? { isActive: { $ne: false } } : {})
                },
            },
            {
                $lookup: {
                    from: 'employees', localField: 'departmentHead',
                    foreignField: '_id', as: 'departmentHead'
                }
            },
        ])

        if (departments.length > 0) {
            return res.status(200).json(departments);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const createCustomerDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departmentData = req.body;

        const existingDeleted = await Department.findOne({
            departmentName: departmentData.departmentName,
            forCustomerContact: departmentData.forCustomerContact,
            isDeleted: true
        })

        if (existingDeleted) {
            const revivedDepartment = await Department.findOneAndUpdate(
                { _id: existingDeleted._id },
                {
                    $set: {
                        departmentHead: departmentData.departmentHead,
                        isDeleted: false
                    }
                },
                { new: true }
            ).populate(['departmentHead'])

            return res.status(200).json({
                ...revivedDepartment.toObject(),
                message: 'Department already existed, renewed'
            })
        }

        const department = new Department(departmentData)
        const saveDepartment = await (await department.save()).populate(['departmentHead'])

        if (saveDepartment) {
            return res.status(200).json(saveDepartment)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const updateCustomerDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body
        let department = await Department.findOneAndUpdate(
            {
                _id: data._id,
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    departmentName: data.departmentName,
                    ...optionalFields(data, ['isActive'])
                }
            }
        );

        if (department) {
            department = await (await Department.findOne({ _id: department._id })).populate('departmentHead')
            return res.status(200).json(department)
        }

        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const totalEnquiries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;

        let reportedToUserIds = await getAllReportedEmployees(userId);


        const departmentsWithCounts = await Department.aggregate([
            {
                $match: {
                    forCustomerContact: false,
                    isDeleted: { $ne: true }
                },
            },
            {
                $lookup: {
                    from: 'enquiries',
                    localField: '_id',
                    foreignField: 'department',
                    as: 'enquiries'
                }
            },
            {
                $addFields: {
                    filteredEnquiries: {
                        $filter: {
                            input: '$enquiries',
                            as: 'enquiry',
                            cond: {
                                $switch: {
                                    branches: [
                                        {
                                            case: { $eq: [access, 'created'] },
                                            then: { $eq: ['$$enquiry.salesPerson', new ObjectId(userId)] }
                                        },
                                        {
                                            case: { $eq: [access, 'reported'] },
                                            then: { $in: ['$$enquiry.salesPerson', reportedToUserIds] }
                                        },
                                        {
                                            case: { $eq: [access, 'createdAndReported'] },
                                            then: {
                                                $or: [
                                                    { $eq: ['$$enquiry.salesPerson', new ObjectId(userId)] },
                                                    { $in: ['$$enquiry.salesPerson', reportedToUserIds] }
                                                ]
                                            }
                                        }
                                    ],
                                    default: { $literal: true }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalEnquiries: {
                        $size: '$filteredEnquiries'
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    departmentId: '$_id',
                    departmentName: '$departmentName',
                    totalEnquiries: 1
                }
            }
        ]);

        if (departmentsWithCounts) return res.status(200).json(departmentsWithCounts);
        return res.status(502).json();
    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const createInternalDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departmentData = req.body

        const existingDeleted = await internalDepartment.findOne({
            departmentName: departmentData.departmentName,
            isDeleted: true
        })

        if (existingDeleted) {
            const revivedDepartment = await internalDepartment.findOneAndUpdate(
                { _id: existingDeleted._id },
                {
                    $set: {
                        departmentHead: departmentData.departmentHead,
                        isDeleted: false
                    }
                },
                { new: true }
            ).populate(['departmentHead'])

            return res.status(200).json({
                ...revivedDepartment.toObject(),
                message: 'Department already existed, renewed'
            })
        }

        const department = new internalDepartment(departmentData)
        const saveDepartment = await (await department.save()).populate(['departmentHead'])

        if (saveDepartment) {
            return res.status(200).json(saveDepartment)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getInternalDepartments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departments = await internalDepartment.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    ...(req.query.activeOnly === 'true' ? { isActive: { $ne: false } } : {})
                }
            },
            {
                $lookup: {
                    from: 'employees', localField: 'departmentHead',
                    foreignField: '_id', as: 'departmentHead'
                }
            },
        ])

        if (departments.length > 0) {
            return res.status(200).json(departments);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const updateInternalDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body
        const set: Record<string, any> = {
            departmentName: data.departmentName,
            departmentHead: data.departmentHead,
            ...optionalFields(data, ['code', 'costCentre', 'isActive'])
        }
        // Optional fields: only touched when the client sends them.
        if (data.description !== undefined) set.description = data.description
        if (data.parentDepartment !== undefined) {
            if (data.parentDepartment && String(data.parentDepartment) === String(data._id)) {
                return res.status(400).json({ message: 'A department cannot be its own parent' })
            }
            set.parentDepartment = data.parentDepartment || null
        }
        let department = await internalDepartment.findOneAndUpdate(
            {
                _id: data._id,
                isDeleted: { $ne: true }
            },
            { $set: set }
        );

        if (department) {
            department = await (await internalDepartment.findOne({ _id: department._id })).populate('departmentHead')
            return res.status(200).json(department)
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const deleteDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employee } = req.body;

        // Check if department exists
        const department = await Department.findById(dataId);

        if (!department) {
            return res.status(404).json({ message: 'Department not found' });
        }

        const use = await salesDepartmentInUse(dataId)
        if (use.customers || use.enquiries) {
            return res.status(409).json({ message: `Department is in use by ${use.customers} customer(s) and ${use.enquiries} enquiry(ies). Reassign them first.` })
        }

        // Delete the department
        await Department.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Department', dataId, employee)

        return res.status(200).json({
            success: true,
            message: 'Department deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}

export const deleteInternalDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employee } = req.body;

        // Check if department exists and isn't already deleted
        const department = await internalDepartment.findOne({
            _id: dataId
        });

        if (!department) {
            return res.status(404).json({
                message: 'Internal department not found or already deleted'
            });
        }

        const [members, children] = await Promise.all([
            Employee.countDocuments({ department: dataId, isDeleted: { $ne: true } }),
            internalDepartment.countDocuments({ parentDepartment: dataId, isDeleted: { $ne: true } }),
        ])
        if (members || children) {
            return res.status(409).json({ message: `Department has ${members} employee(s) and ${children} sub-department(s). Move them first.` })
        }

        // Soft delete the department
        await internalDepartment.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('InternalDepartment', dataId, employee)

        return res.status(200).json({
            success: true,
            message: 'Internal department deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}

export const deleteCustomerDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employee } = req.body;

        // Check if customer department exists and isn't already deleted
        const department = await Department.findOne({
            _id: dataId,
            forCustomerContact: true
        });

        if (!department) {
            return res.status(404).json({
                message: 'Customer department not found or already deleted'
            });
        }

        const contacts = await Customer.countDocuments({ 'contactDetails.department': dataId, isDeleted: { $ne: true } })
        if (contacts) {
            return res.status(409).json({ message: `Department is used by contacts of ${contacts} customer(s). Reassign them first.` })
        }

        // Soft delete the department
        await Department.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Department', dataId, employee)

        return res.status(200).json({
            success: true,
            message: 'Customer department deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}

// Read-only: employee headcount per internal department.
export const getInternalDepartmentHeadcount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departments = await internalDepartment.find({ isDeleted: { $ne: true } })
            .populate('departmentHead', 'firstName lastName designation').lean()
        const counts = await Employee.aggregate([
            { $match: { isDeleted: { $ne: true }, department: { $ne: null } } },
            { $group: { _id: '$department', headcount: { $sum: 1 } } }
        ])
        const countMap = new Map(counts.map((c: any) => [String(c._id), c.headcount]))
        const result = departments.map((d: any) => ({
            _id: d._id,
            departmentName: d.departmentName,
            departmentHead: d.departmentHead || null,
            description: d.description || '',
            parentDepartment: d.parentDepartment || null,
            headcount: countMap.get(String(d._id)) || 0
        }))
        return res.status(200).json(result)
    } catch (error) {
        console.log(error)
        next(error)
    }
}

// Read-only: department members plus reporting tree (via Employee.reportingTo).
export const getInternalDepartmentOrgChart = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dept: any = await internalDepartment.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
            .populate('departmentHead', 'firstName lastName designation').lean()
        if (!dept) return res.status(404).json({ message: 'Department not found' })

        const employees: any[] = await Employee.find(
            { department: dept._id, isDeleted: { $ne: true } },
            'employeeId firstName lastName designation reportingTo'
        ).lean()

        const nodes = new Map<string, any>()
        employees.forEach(e => nodes.set(String(e._id), { ...e, reports: [] }))
        const roots: any[] = []
        nodes.forEach(n => {
            const parent = n.reportingTo ? nodes.get(String(n.reportingTo)) : null
            if (parent && parent !== n) parent.reports.push(n)
            else roots.push(n)
        })

        return res.status(200).json({
            _id: dept._id,
            departmentName: dept.departmentName,
            departmentHead: dept.departmentHead || null,
            headcount: employees.length,
            orgChart: roots
        })
    } catch (error) {
        console.log(error)
        next(error)
    }
}
