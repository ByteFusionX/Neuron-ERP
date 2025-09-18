import { Request, Response, NextFunction } from "express";
import Customer from '../models/customer.model';
import Employee from '../models/employee.model';
import { newTrash } from '../controllers/trash.controller'
import { getAllReportedEmployees, getEmployeeData } from "../common/utils/util";
import employeeModel from "../models/employee.model";
const { ObjectId } = require('mongodb')

export const getAllCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = new ObjectId(req.params.userId);

        const employeeAccess = await employeeModel.findOne({ _id: new ObjectId(userId) }).populate('category') as any


        // Access Filter
        let accessFilter = {};
        const reportedToUserIds = await getAllReportedEmployees(userId);

        switch (employeeAccess.category.privileges.customer.viewReport) {
            case 'created':
                accessFilter = {
                    $or: [
                        { createdBy: new ObjectId(userId) },
                        { sharedWith: { $in: [new ObjectId(userId)] } },
                    ],
                };
                break;
            case 'reported':
                accessFilter = {
                    $or: [
                        { createdBy: { $in: reportedToUserIds } },
                        { sharedWith: { $in: reportedToUserIds } },
                    ],
                };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = {
                    $or: [
                        { createdBy: { $in: reportedToUserIds } },
                        { sharedWith: { $in: reportedToUserIds } },
                    ],
                };
                break;
            default:
                accessFilter = {};
                break;
        }

        // Combine Filters
        const filters = accessFilter;

        // Fetch Customers
        const customers = await Customer.aggregate([
            { $match: filters },
            { $match: { isDeleted: { $ne: true } } },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'department',
                },
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                },
            },
            {
                $unwind: {
                    path: '$department',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $unwind: {
                    path: '$createdBy',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $project: {
                    _id: 1,
                    companyName: 1,
                    clientRef: 1,
                    department: 1,
                    companyAddress: 1,
                    createdBy: 1,
                    contactDetails: 1
                },
            },
            { $sort: { createdDate: -1 } },
        ]);

        if (!customers || customers.length === 0) {
            return res.status(204).json({ message: 'No customers found' });
        }

        return res.status(200).json(customers);
    } catch (error) {
        console.error(error);
        next(error);
    }
};


export const getFilteredCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, createdBy, access, userId, search } = req.body;
        let skipNum: number = (page - 1) * row;
        let isCreatedBy = createdBy == null ? true : false;


        let searchRegex = search.split('').join('\\s*');
        let matchFilters = {
            isDeleted: { $ne: true },
            $or: [
                { companyName: { $regex: search, $options: 'i' } },
                { clientRef: { $regex: search, $options: 'i' } },]
        }

        let createdByFilter = {
            $or: [
                { createdBy: new ObjectId(createdBy) },
                { createdBy: { $exists: isCreatedBy } },
            ]
        }

        let accessFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = {
                    $or: [
                        { createdBy: new ObjectId(userId) },
                        { sharedWith: { $in: [new ObjectId(userId)] } }
                    ]
                };
                break;
            case 'reported':
                accessFilter = {
                    $or: [
                        { createdBy: new ObjectId(userId) },
                        { sharedWith: { $in: [new ObjectId(userId)] } }
                    ]
                };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = {
                    $or: [
                        { createdBy: new ObjectId(userId) },
                        { sharedWith: { $in: [new ObjectId(userId)] } }
                    ]
                };
                break;

            default:
                break;
        }

        const filters = { $and: [matchFilters, accessFilter, createdByFilter] }

        let total: number = 0;
        await Customer.aggregate([
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

        const employeeAccess = await employeeModel
            .findOne({ _id: new ObjectId(userId) })
            .populate('category') as any;

        let empAccessFilter = {};

        switch (employeeAccess.category.privileges.employee.viewReport) {
            case 'reported':
                empAccessFilter = { reportingTo: new ObjectId(userId) };
                break;
            case 'created':
                empAccessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'createdAndReported':
                empAccessFilter = {
                    $or: [
                        { reportingTo: new ObjectId(userId) },
                        { createdBy: new ObjectId(userId) },
                    ]
                };
                break;
            default:
                break;
        }

        // Fetch all accessible employees
        const accessibleEmployees = await Employee.aggregate([
            { $match: empAccessFilter },
            { $project: { _id: 1 } }, // Only keep the employee IDs
        ]);

        const accessibleEmployeeIds = accessibleEmployees.map(emp => emp._id);

        // Aggregation pipeline for customers
        const customerData = await Customer.aggregate([
            {
                $match: filters,
            },
            {
                $skip: skipNum,
            },
            {
                $limit: row,
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'department',
                },
            },
            {
                $lookup: {
                    from: 'customertypes',
                    localField: 'customerType',
                    foreignField: '_id',
                    as: 'customerType',
                },
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy',
                },
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'sharedWith',
                    foreignField: '_id',
                    as: 'sharedWith',
                },
            },
            {
                $addFields: {
                    sharedWith: {
                        $filter: {
                            input: "$sharedWith",
                            as: "employee",
                            cond: { $in: ["$$employee._id", accessibleEmployeeIds] },
                        },
                    },
                },
            },
            {
                $unwind: {
                    path: "$sharedWith",
                    preserveNullAndEmptyArrays: true,
                },

            },
            {
                $unwind: "$department",
            },
            {
                $unwind: {
                    path: "$customerType",
                    preserveNullAndEmptyArrays: true,
                },

            },
            {
                $unwind: "$createdBy",
            },
            {
                $unwind: "$contactDetails",
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'contactDetails.department',
                    foreignField: '_id',
                    as: 'contactDetails.department',
                },
            },
            {
                $unwind: {
                    path: "$contactDetails.department",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $group: {
                    _id: "$_id",
                    clientRef: { $first: "$clientRef" },
                    department: { $first: "$department" },
                    companyName: { $first: "$companyName" },
                    companyAddress: { $first: "$companyAddress" },
                    customerType: { $first: "$customerType" },
                    customerEmailId: { $first: "$customerEmailId" },
                    contactNo: { $first: "$contactNo" },
                    createdBy: { $first: "$createdBy" },
                    sharedWith: { $push: "$sharedWith" },
                    createdDate: { $first: "$createdDate" },
                    contactDetails: { $push: "$contactDetails" },
                },
            },
            {
                $sort: { createdDate: 1 },
            },
        ]);


        if (!customerData || !total) return res.status(204).json({ err: 'No enquiry data found' })
        return res.status(200).json({ total: total, customers: customerData })

    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const getCustomerByCustomerId = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { access, userId } = req.query;
        let customerId = req.params.customerId;
        let accessFilter = {};

        let reportedToUserIds = await getAllReportedEmployees(userId);

        switch (access) {
            case 'created':
                accessFilter = { createdBy: new ObjectId(userId) };
                break;
            case 'reported':
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;
            case 'createdAndReported':
                reportedToUserIds.push(new ObjectId(userId));
                accessFilter = { createdBy: { $in: reportedToUserIds } };
                break;

            default:
                break;
        }


        const matchFilters = {
            clientRef: customerId,
            isDeleted: { $ne: true }
        }
        const filters = { $and: [matchFilters, accessFilter] }

        const customerExist = await Customer.findOne({ clientRef: customerId });

        if (customerExist) {
            const customerData = await Customer.aggregate([
                {
                    $match: filters
                },
                {
                    $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' }
                },
                {
                    $lookup: { from: 'employees', localField: 'createdBy', foreignField: '_id', as: 'createdBy' }
                },
                {
                    $unwind: "$contactDetails"
                },
                {
                    $lookup: {
                        from: 'departments',
                        localField: 'contactDetails.department',
                        foreignField: '_id',
                        as: 'contactDetails.department'
                    }
                },
                {
                    $lookup: {
                        from: 'customertypes',
                        localField: 'customerType',
                        foreignField: '_id',
                        as: 'customerType'
                    }
                },
                {
                    $unwind: "$contactDetails.department",
                },
                {
                    $unwind: {
                        path: "$customerType",
                        preserveNullAndEmptyArrays: true,
                    },
                },
                {
                    $unwind: "$department"
                },
                {
                    $unwind: "$createdBy"
                },
                {
                    $group: {
                        _id: "$_id",
                        clientRef: { $first: "$clientRef" },
                        department: { $first: "$department" },
                        companyName: { $first: "$companyName" },
                        companyAddress: { $first: "$companyAddress" },
                        customerEmailId: { $first: "$customerEmailId" },
                        customerType: { $first: "$customerType" },
                        contactNo: { $first: "$contactNo" },
                        createdBy: { $first: "$createdBy" },
                        createdDate: { $first: "$createdDate" },
                        contactDetails: { $push: "$contactDetails" },
                    },
                },
            ])

            if (customerData[0]) {
                return res.status(200).json({ access: true, customerData: customerData[0] })
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

export const getCustomerCreators = async (req: Request, res: Response, next: NextFunction) => {
    try {

        const customers = await Customer.aggregate([
            {
                $group: {
                    _id: "$createdBy",
                    count: { $sum: 1 }
                },
            },
            {
                $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'createdBy' }
            },
            {
                $unwind: "$createdBy"
            },
            {
                $project: {
                    _id: 0,
                    createdBy: 1
                }
            },
            {
                $project: {
                    _id: "$createdBy._id",
                    fullName: { $concat: ["$createdBy.firstName", " ", "$createdBy.lastName"] }
                }
            }
        ]);
        if (customers.length > 0) {
            return res.status(200).json(customers);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const shareOrTransferCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customerId, employees, type } = req.body;
        console.log(req.body)

        // Validate the request body
        if (!customerId || !employees || !type) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const customer = await Customer.findById(customerId);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        if (type == "Transfer") {
            // Transfer ownership to the first employee in the array
            const newOwner = employees;
            if (!newOwner) {
                return res
                    .status(400)
                    .json({ message: "Employee ID required for transfer" });
            }
            customer.createdBy = newOwner; // Update ownership
            customer.sharedWith.filter((res) => res !== newOwner)
        } else if (type == "Share") {
            // Share the customer with specified employees
            customer.sharedWith = [
                ...new Set([...customer.sharedWith, ...employees]), // Avoid duplicates
            ];
        } else {
            return res.status(400).json({ message: "Invalid type. Use 'transfer' or 'share'" });
        }
        const savedCustomer = await customer.save();

        // Populate both `createdBy` and `sharedWith`
        const newCustomer = await Customer.findById(savedCustomer._id)
            .populate('createdBy') // Populate single reference
            .populate('sharedWith'); // Populate array of references

        console.log(newCustomer);

        res.status(200).json(newCustomer);
    } catch (error) {
        console.error(error);
        next(error);
    }
}

export const stopSharingCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { customerId, employeeId } = req.body;

        // Validate the request body
        if (!customerId || !employeeId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const customer = await Customer.findById(customerId);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // Remove the employeeId from the sharedWith array
        customer.sharedWith = customer.sharedWith.filter(id => id.toString() !== employeeId);

        const updatedCustomer = await customer.save();

        res.status(200).json(updatedCustomer);
    } catch (error) {
        console.error(error);
        next(error);
    }
}

export const createCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerData = req.body
        const userToken = req.user;

        customerData.companyName = customerData.companyName.trim();
        const companyExist = await Customer.findOne({ companyName: new RegExp(`^${customerData.companyName}$`, 'i') })

        if (companyExist) {
            return res.status(200).json({ companyExist: true })
        }

        const createdBy = await getEmployeeData(userToken)
        customerData.createdBy = createdBy._id

        let clientId: string = await generateClientRef(customerData.createdDate);
        customerData.clientRef = clientId;

        const customer = new Customer(customerData)
        const saveCustomer = await customer.save()

        if (saveCustomer) {
            return res.status(200).json(saveCustomer)
        }
        
        return res.status(502).json()
    } catch (error) {
        console.log(error)
        next(error)
    }
}

export const editCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id, department, contactDetails, companyName, customerEmailId, contactNo, companyAddress, customerType } = req.body;
        const companyNameTrimmed = companyName.trim();
        const companyExist = await Customer.findOne({ companyName: new RegExp(`^${companyNameTrimmed}$`, 'i'), _id: { $ne: id } })
        if (companyExist) {
            return res.status(200).json({ companyExist: true })
        }
        const updatedCustomer = await Customer.findOneAndUpdate({ _id: id }, {
            $set: {
                department: department,
                contactDetails: contactDetails,
                companyName: companyName,
                customerEmailId: customerEmailId,
                companyAddress: companyAddress,
                contactNo: contactNo,
                customerType: customerType,
            }
        })
        return res.status(200).json(updatedCustomer)
    } catch (error) {
        console.log(error)
        next(error)
    }
}

const generateClientRef = async (date: string) => {
    try {
        const lastClientId = await Customer.aggregate([
            {
                $match: {
                    clientRef: { $ne: null }
                }
            },
            {
                $addFields: {
                    slNoString: {
                        $regexFind: {
                            input: "$clientRef",
                            regex: "^[0-9]+"
                        }
                    }
                }
            },
            {
                $addFields: {
                    slNo: {
                        $toInt: "$slNoString.match"
                    }
                }
            },
            {
                $sort: { slNo: -1 }
            }
        ]);
        let clientRef: string;
        const currentYear = new Date().getFullYear();
        const year = currentYear.toString().slice(-2);

        if (lastClientId.length) {
            let lastSlNo = lastClientId[0].slNo;
            const formattedSlNo = String(lastSlNo + 1).padStart(3, '0');
            clientRef = `${formattedSlNo}-${year}`
        } else {
            clientRef = `001-${year}`
        }
        return clientRef;
    } catch (error) {
        console.log(error)
    }
}

export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employeeId } = req.body

        // Check if customer exists and isn't already deleted
        const customer = await Customer.findOne({
            _id: dataId,
        });

        if (!customer) {
            return res.status(404).json({
                message: 'Customer not found or already deleted'
            });
        }

        // Soft delete the customer
        await Customer.findByIdAndUpdate(dataId, {
            isDeleted: true
        });
        newTrash('Customer', dataId, employeeId)

        return res.status(200).json({
            success: true,
            message: 'Customer deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}