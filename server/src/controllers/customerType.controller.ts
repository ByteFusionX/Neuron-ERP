import { Request, Response, NextFunction } from "express";
const { ObjectId } = require('mongodb')
import { newTrash } from '../controllers/trash.controller'
import  CustomerType  from '../models/customerType.model'

export const getCustomerTypes = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerTypes = await CustomerType.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true }
                },
            },
        ])

        if (customerTypes.length > 0) {
            return res.status(200).json(customerTypes);
        }
        return res.status(204).json()
    } catch (error) {
        console.log(error)
next(error)
    }
}


export const createCustomerType = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const customerTypeData = req.body
        const customerType = new CustomerType(customerTypeData)

        const duplicateCheck = await CustomerType.findOne({ customerTypeName:customerTypeData.customerTypeName, isDeleted : false })

        if(duplicateCheck){
            return res.status(409).json( {message :"Duplicate customer type found"})
        }else{
            const saveCustomerType = await customerType.save()
            if (saveCustomerType) {
                return res.status(200).json(saveCustomerType)
            }
        }
      
        return res.status(502).json()
    } catch (error) {
        console.log(error)
next(error)
    }
}


export const updateCustomerType = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body

        const duplicateCheck = await CustomerType.findOne({ customerTypeName:data.customerTypeName, isDeleted : false })

        if(duplicateCheck){
            return res.status(409).json( {message :"Duplicate customer type found"})
        }else{

        let customerType = await CustomerType.findOneAndUpdate({ _id: data._id }, { $set: { customerTypeName: data.customerTypeName } })

        if (customerType) {
            customerType =await CustomerType.findOne({ _id: customerType._id })
            return res.status(200).json(customerType)
        }
        return res.status(502).json()
    }
} catch (error) {
        console.log(error)
next(error)
    }
}


export const deleteDepartment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dataId, employee } = req.body;

        // Check if customerType exists
        const customerType = await CustomerType.findById(dataId);

        if (!customerType) {
            return res.status(404).json({ message: 'Customer Type not found' });
        }

        // Delete the customerType
        await CustomerType.findByIdAndUpdate(dataId, {
            isDeleted: true
        });

        newTrash('CustomerType', dataId, employee)  // need to reconfirm

        return res.status(200).json({
            success: true,
            message: 'Customer Type deleted successfully'
        });
    } catch (error) {
        next(error);
    }
}