import { NextFunction, Response, Request } from "express";
import Trash from '../models/trash.model'
import Department from '../models/department.model'
import InternalDepartment from '../models/internal.department'
import Category from '../models/category.model'
import Employee from '../models/employee.model'
import Customer from '../models/customer.model'
import Enquiry from '../models/enquiry.model'
import Quotation from '../models/quotation.model'
import Job from '../models/job.model'
import CustomerType from '../models/customerType.model'

const allowedModels = ['Employee', 'Customer', 'Quotation', 'Enquiry', 'Department', 'InternalDepartment', 'Category', 'Job', 'CustomerType'];

export const newTrash = async (from: string, dataId: string, employee: string) => {
    if (!allowedModels.includes(from)) {
        throw new Error(`${from} is not a valid model for Trash.`);
    }

    const newTrash = new Trash({
        deletedFrom: from,
        deletedData: dataId,
        deletedBy: employee,
        date: new Date()
    })
    await newTrash.save()
    return
}


export const fetchTrash = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = await Trash.deleteMany({ date: { $lt: oneDayAgo } });
        const trashes = await Trash.find().populate(['deletedData', 'deletedBy']).sort({ date: -1 })
        return res.status(200).json(trashes)
    } catch (error) {
        next(error)
    }
}

export const restoreTrash = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { from, dataId } = req.body

        switch (from) {
            case 'Department':
                await Department.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            case 'InternalDepartment':
                await InternalDepartment.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            case 'Category':
                await Category.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            case 'Employee': {
                const query = Employee.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                query.setOptions({ actingEmployeeId: req.employeeId } as any);
                await query
                break;
            }
            case 'Customer': {
                const query = Customer.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                query.setOptions({ actingEmployeeId: req.employeeId } as any);
                await query
                break;
            }
            case 'Enquiry':
                await Enquiry.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            case 'Quotation': {
                const query = Quotation.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                query.setOptions({ actingEmployeeId: req.employeeId } as any);
                await query
                break;
            }
            case 'Job':
                await Job.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            case 'CustomerType':
                await CustomerType.findOneAndUpdate({ _id: dataId }, { $set: { isDeleted: false } })
                break;
            default:
                break;
        }

        const deleteTrash = await Trash.findOneAndDelete({ deletedData: dataId })
        if (deleteTrash) {
            return res.status(200).json({ message: `${from} restored successfully` })
        }
        return res.status(502).json
    } catch (error) {
        next(error)
    }
}