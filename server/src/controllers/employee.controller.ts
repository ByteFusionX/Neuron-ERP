import { Request, Response, NextFunction } from "express";
import Employee from '../models/employee.model'
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import announcementModel from "../models/announcement.model";
import enquiryModel from "../models/enquiry.model";
import quotationModel from "../models/quotation.model";
import categoryModel, { UserRole } from "../models/category.model";
import departmentModel from "../models/department.model";
import { newTrash } from '../controllers/trash.controller'
import { getAllReportedEmployees, getUSDRated } from "../common/util";
import customerModel from "../models/customer.model";
import employeeModel from "../models/employee.model";
import { CostExplorer } from "aws-sdk";
import notificationModel from "../models/notification.model";
import mongoose from "mongoose";
const ObjectId = require('mongoose').Types.ObjectId;

export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employees = await Employee.find(
            { isDeleted: { $ne: true } },
            { password: 0 }
        )
            .sort({ createdDate: -1 })
            .populate('department');

        if (employees.length) {
            return res.status(200).json(employees);
        }
        return res.status(204).json();
    } catch (error) {
        next(error)
    }
}

export const getPresaleManagers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Fetch employees and populate the 'category' and 'department' fields
        const employees = await Employee.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: false } },
            { $match: { 'category.privileges.assignedJob.viewReport': 'all' } },
            {
                $project: {
                    password: 0
                }
            },

            { $sort: { createdDate: -1 } }
        ]);
        if (employees.length) {
            return res.status(200).json(employees);
        }
        return res.status(204).json(); // No content
    } catch (error) {
        next(error);
    }
};


export const getPresaleEngineers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employees = await Employee.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: { path: '$category', preserveNullAndEmptyArrays: false } },
            { $match: { 'category.privileges.assignedJob.viewReport': 'assigned' } },
            {
                $project: {
                    password: 0
                }
            },

            { $sort: { createdDate: -1 } }
        ]);

        if (employees.length) {
            return res.status(200).json(employees);
        }
        return res.status(204).json();
    } catch (error) {
        next(error)
    }
}

export const getEmployeesForCustomerTransfer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerId = req.params.customerId;
        const userId = req.params.userId;

        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        // Fetch the customer data to determine access criteria
        const customer = await customerModel.findOne({ _id: new ObjectId(customerId) });
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const employeeAccess = await employeeModel.findOne({ _id: new ObjectId(userId) }).populate('category') as any;

        // Check if employeeAccess is null
        if (!employeeAccess) {
            return res.status(404).json({ message: "Employee not found" });
        }

        const reportedEmployee = await employeeModel.findOne({ _id: employeeAccess.reportingTo });

        if (employeeAccess?.category?.privileges?.employee?.viewReport == 'none') {
            res.status(200).json([reportedEmployee]);
        }

        let accessFilter = {};

        switch (employeeAccess.category.privileges.employee.viewReport) {
            case 'reported':
                accessFilter = { reportingTo: new ObjectId(userId) };
                break;
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'createdAndReported':
                accessFilter = {
                    $or: [
                        { reportingTo: new ObjectId(userId) },
                        { createdBy: new ObjectId(userId) }
                    ]
                };
                break;

            default:
                break;
        }


        // Fetch all employees
        let allEmployees = await Employee.aggregate([
            {
                $match: accessFilter
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category",
                },
            },
            { $unwind: "$category" },
            { $project: { password: 0 } },
        ]);

        
        allEmployees = [...allEmployees,reportedEmployee]   
        
        const employeesWithoutAccess = await Promise.all(
            allEmployees.map(async (employee) => {
                // Check if the employee is in the sharedWith array
                const isShared = customer.sharedWith.some(
                    (sharedEmployeeId) => String(sharedEmployeeId) === String(employee._id)
                );
                if (isShared) {
                    return { employee, hasAccess: true }; // Mark as having access
                }

                const privilege = employee?.category?.privileges?.customer?.viewReport;

                switch (privilege) {
                    case "created":
                        // Employee created the customer
                        return {
                            employee,
                            hasAccess: String(customer.createdBy) === String(employee._id),
                        };

                    case "reported":
                        // Employee reports to someone who created the customer
                        const reportedEmployees = await getAllReportedEmployees(customer.createdBy);
                        return {
                            employee,
                            hasAccess: reportedEmployees.includes(employee._id.toString()),
                        };

                    case "createdAndReported":
                        // Employee either created or reports to someone who created the customer
                        const reportedAndCreated = [
                            ...(await getAllReportedEmployees(customer.createdBy)),
                            customer.createdBy.toString(),
                        ];
                        return {
                            employee,
                            hasAccess: reportedAndCreated.includes(employee._id.toString()),
                        };

                    default:
                        // No explicit access privilege
                        return { employee, hasAccess: true };
                }
            })
        );

        // Filter out employees who have access
        const result = employeesWithoutAccess
            .filter(({ hasAccess }) => !hasAccess) // Keep employees without access
            .map(({ employee }) => employee); // Extract the employee objects

        if (result.length) {
            return res.status(200).json(result);
        }

        return res.status(204).json({ message: "All employees have access to the customer" });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const isEmployeePresent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employeeCount = await Employee.countDocuments({ isDeleted: { $ne: true } });
        const categoryCount = await categoryModel.countDocuments();
        const departmentCount = await departmentModel.countDocuments();

        if (employeeCount > 0) {
            return res.status(200).json({ exists: true });
        }

        return res.status(200).json({ exists: false });
    } catch (error) {
        console.log(error)
        next(error);
    }
}

export const getEmployeeByEmployeId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;
        let employeeId = req.params.employeeId;
        let accessFilter = {};

        switch (access) {
            case 'reported':
                accessFilter = { reportingTo: new ObjectId(userId) };
                break;
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'createdAndReported':
                accessFilter = {
                    $or: [
                        { reportingTo: new ObjectId(userId) },
                        { createdBy: new ObjectId(userId) }
                    ]
                };
                break;

            default:
                break;
        }

        const matchFilters = {
            employeeId: employeeId,
            isDeleted: { $ne: true }
        }
        const filters = { $and: [matchFilters, accessFilter] }
        const employeeExist = await Employee.findOne({
            employeeId: employeeId,
            isDeleted: { $ne: true }
        });

        if (employeeExist) {
            const employeeData = await Employee.aggregate([
                {
                    $match: filters
                },
                {
                    $lookup: { from: 'internaldepartments', localField: 'department', foreignField: '_id', as: 'department' }
                },
                {
                    $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' }
                },
                {
                    $lookup: { from: 'employees', localField: 'reportingTo', foreignField: '_id', as: 'reportingTo' }
                },
                {
                    $unwind: "$department"
                },
                {
                    $unwind: "$reportingTo"
                },
                {
                    $unwind: "$category"
                },
                {
                    $project: { password: 0 }
                }
            ])

            if (employeeData[0]) {
                return res.status(200).json({ access: true, employeeData: employeeData[0] })
            } else {
                return res.status(200).json({ access: false })
            }
        }

        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getFilteredEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, search, access, userId } = req.body;
        let skipNum: number = (page - 1) * row;
        let searchRegex = search.split('').join('\\s*');
        let fullNameRegex = new RegExp(searchRegex, 'i');
        let total: number = 0;

        let matchFilters = {
            isDeleted: { $ne: true },
            $or: [
                { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: fullNameRegex } } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { employeeId: { $regex: search, $options: 'i' } },
            ]
        }

        let accessFilter = {};
        switch (access) {
            case 'reported':
                accessFilter = { reportingTo: new ObjectId(userId) };
                break;
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'createdAndReported':
                accessFilter = {
                    $or: [
                        { reportingTo: new ObjectId(userId) },
                        { createdBy: new ObjectId(userId) }
                    ]
                };
                break;
            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter] }

        await Employee.aggregate([
            {
                $match: filters
            },
            {
                $group: { _id: null, total: { $sum: 1 } }
            },
            {
                $project: { total: 1, _id: 0 }
            }
        ]).exec()
            .then((result: { total: number }[]) => {
                if (result && result.length > 0) {
                    total = result[0].total
                }
            })

        const qatarUsdRate = await getUSDRated();

        const employeeData = await Employee.aggregate([
            {
                $match: filters,
            },
            {
                $skip: skipNum
            },
            {
                $limit: row
            },
            {
                $lookup: {
                    from: 'internaldepartments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'department'
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            {
                $unwind: {
                    path: "$department",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: "$category",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'reportingTo',
                    foreignField: '_id',
                    as: 'reportingTo'
                }
            },
            {
                $unwind: {
                    path: "$reportingTo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $sort: { employeeId: 1 }
            },
        ]);
        if (!employeeData || !total) return res.status(204).json({ err: 'No data found' })
        return res.status(200).json({ total: total, employees: employeeData })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let employeeId: string = await generateEmployeeId();
        const employeeData = req.body;
        employeeData.employeeId = employeeId;

        const password = employeeData.password;
        employeeData.password = await bcrypt.hash(password, 10);

        const employee = new Employee(employeeData);

        const saveEmployee = await (await employee.save()).populate('category department reportingTo');
        if (saveEmployee) {
            return res.status(200).json(saveEmployee);
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getPasswordForEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const id = req.params.id
        const employee = await Employee.findById(id)
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const editEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const updatedEmployeeData = { ...req.body };
        const employeeId = req.body.employeeId;

        delete updatedEmployeeData.password;
        delete updatedEmployeeData.employeeId;

        const { password } = req.body;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updatedEmployeeData.password = hashedPassword
        }

        const saveEmployeeEdit = await Employee.findOneAndUpdate(
            {
                _id: employeeId,
                isDeleted: { $ne: true }
            },
            updatedEmployeeData,
            { new: true }
        ).populate('category department reportingTo')

        if (saveEmployeeEdit) {
            return res.status(200).json(saveEmployeeEdit);
        }
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const setTarget = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { year, salesRevenue, grossProfit } = req.body;

        const employeeId = req.params.employeeId;

        const existingTarget = await Employee.findOne({
            _id: employeeId,
            targets: {
                $elemMatch: {
                    year: year
                }
            }
        });


        if (existingTarget) {
            return res.status(409).json({
                message: `A target with year ${year} already exists.`,
            });
        }

        const employeeTargetUpdate = await Employee.findOneAndUpdate(
            { _id: employeeId },
            {
                $push: {
                    targets: {
                        year,
                        salesRevenue,
                        grossProfit
                    },
                }
            },
            { upsert: true, new: true }
        );

        if (employeeTargetUpdate) {
            return res.status(200).json(employeeTargetUpdate.targets);
        }
        return res.status(204).json();

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const updateTarget = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const target = req.body;
        const employeeId = req.params.employeeId;
        const targetId = req.params.targetId;

        // Validate targetId
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ message: 'Invalid target ID' });
        }
        const targetObjectId = new mongoose.Types.ObjectId(targetId);

        // Find the employee
        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Check for duplicate year in other targets (excluding the current target)
        const isDuplicate = employee.targets.some(t =>
            t._id.toString() === targetObjectId.toString() && t.year === target.year
        );

        if (isDuplicate) {
            return res.status(409).json({
                message: `A target with year ${target.year} already exists.`,
            });
        }

        // Proceed to update the target
        const updatedEmployee = await Employee.findOneAndUpdate(
            {
                _id: employeeId,
                "targets._id": targetObjectId
            },
            {
                $set: { "targets.$": { ...target, _id: targetObjectId } }
            },
            { new: true }
        );

        if (!updatedEmployee) {
            return res.status(404).json({ message: 'Target not found' });
        }

        return res.status(200).json(updatedEmployee.targets);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const changePasswordOfEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { oldPassword, newPassword, userId } = req.body
        const user = await Employee.findById({ userId })
        const userPassword = user.password
        bcrypt.compare(userPassword, oldPassword, async (err, result) => {
            if (err) {
                return
            }
            if (result) {
                await Employee.findOneAndUpdate({ id: user.id }, { $set: { password: newPassword } })
                return res.status(200).json({ passwordChanged: true })
            } else {
                return res.status(502).json({ passwordChanged: false })
            }
        })
    } catch (error) {
        console.log(error)
        next(error)
    }
}


const generateEmployeeId = async () => {
    try {
        const lastEmployee = await Employee.findOne({}, {}, { sort: { employeeId: -1 } });
        let lastEmployeeId: String;

        if (lastEmployee) {
            lastEmployeeId = lastEmployee.employeeId
        }

        if (lastEmployee && lastEmployeeId) {
            const IdNumber = lastEmployeeId.split('-')
            const incrementedNum = parseInt(IdNumber[1]) + 1;
            return `NT-${incrementedNum}`
        } else {
            return 'NT-1100'
        }
    } catch (error) {
        console.log(error)
    }
}


export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { employeeId, password } = req.body
        const employee = await Employee.findOne(
            {
                employeeId: employeeId,
                isDeleted: { $ne: true }
            }
        )
        if (employee) {
            const passwordMatch = await bcrypt.compare(password, employee.password)
            if (passwordMatch) {
                const payload = { id: employee._id, employeeId: employee.employeeId }
                const token = jwt.sign(payload, process.env.JWT_SECRET)
                res.status(200).json({ token: token, employeeData: employee })
            } else {
                res.send({ passwordNotMatchError: true })
            }
        } else {
            res.send({ employeeNotFoundError: true })
        }
    } catch (error) {
        console.log(error)
        next(error)
    }

}

export const getEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employeeId = req.params.id
        const employeeData = await Employee.findOne(
            {
                employeeId: employeeId,
                isDeleted: { $ne: true }
            },
            { password: 0 }
        ).populate('category');

        if (employeeData) return res.status(200).json(employeeData)
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getNotificationCounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.params.token
        const jwtPayload = jwt.verify(token, process.env.JWT_SECRET)
        const userId = (<any>jwtPayload).id

        // Get user's category
        const employee = await Employee.findById(userId);
        const userCategoryId = employee.category;

        // Updated announcement count query
        const announcementCount = await announcementModel.countDocuments({
            viewedBy: { $ne: new ObjectId(userId) },
            $or: [
                { category: { $in: ['all'] } },
                { category: { $in: [userCategoryId] } }
            ]
        });

        const assignedJobCount = await enquiryModel.countDocuments({
            'preSale.presalePerson': new ObjectId(userId),
            $or: [
                { 'preSale.seenbyEmployee': false },
                {
                    $and: [
                        { 'preSale.feedback.seenByFeedbackRequester': false, },
                        { 'preSale.feedback.feedback': { $exists: true } }
                    ]
                }
            ]

        });

        const reAssignedJobCount = await enquiryModel.countDocuments({
            reAssigned: new ObjectId(userId),
            reAssignedSeen: false
        });

        const dealSheetCount = await quotationModel.countDocuments({
            "dealData.status": "pending",
            "dealData.seenByApprover": false,
        });

        const feedbackCount = await enquiryModel.countDocuments({
            'preSale.feedback.employeeId': new ObjectId(userId),
            "preSale.feedback.seenByFeedbackProvider": false,
            'preSale.feedback.feedback': { $exists: false }
        });

        const quotationCount = await quotationModel.countDocuments({
            createdBy: new ObjectId(userId),
            "dealData.seenedBySalsePerson": false,
        })

        const enquiryCount = await enquiryModel.countDocuments({
            salesPerson: new ObjectId(userId),
            "preSale.seenbySalesPerson": false,
            status: 'Work In Progress'
        })

        const employeeCount = {
            announcementCount,
            assignedJobCount,
            reAssignedJobCount,
            dealSheetCount,
            feedbackCount,
            quotationCount,
            enquiryCount
        }

        if (employeeCount) return res.status(200).json(employeeCount)
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employeeId } = req.body

        // Check if employee exists and isn't already deleted
        const employee = await Employee.findOne({
            _id: dataId
        });

        if (!employee) {
            return res.status(404).json({
                message: 'Employee not found or already deleted'
            });
        }

        // Soft delete the employee
        await Employee.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('Employee', dataId, employeeId)

        return res.status(200).json({
            success: true,
            message: 'Employee deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}


