import { Request, Response, NextFunction } from "express";
import Department from '../models/department.model'
import Employee from '../models/employee.model'
import internalDepartment from "../models/internal.department";
import { getAllReportedEmployees } from "../common/utils/util";
const { ObjectId } = require('mongodb')
import { newTrash } from '../controllers/trash.controller'


export const getDepartments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log(req.user)

        const departments = await Department.aggregate([
            {
                $match: {
                    forCustomerContact: false,
                    isDeleted: { $ne: true }
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
        let department = await Department.findOneAndUpdate({ _id: data._id }, { $set: { departmentName: data.departmentName, departmentHead: data.departmentHead } })

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
                    isDeleted: { $ne: true }
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
                    departmentName: data.departmentName
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
                    isDeleted: { $ne: true }
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
        let department = await internalDepartment.findOneAndUpdate(
            {
                _id: data._id,
                isDeleted: { $ne: true }
            },
            {
                $set: {
                    departmentName: data.departmentName,
                    departmentHead: data.departmentHead
                }
            }
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
