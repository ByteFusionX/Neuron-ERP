import { Router } from "express";

import { 
    getCustomerTypes,
    createCustomerType,
    updateCustomerType,
    deleteDepartment
 } from "../controllers/customerType.controller";

const customerTypeRouter = Router()

customerTypeRouter.get('/', getCustomerTypes)
customerTypeRouter.post('/', createCustomerType)
customerTypeRouter.put('/', updateCustomerType)
customerTypeRouter.post('/delete-customerType', deleteDepartment)

export default customerTypeRouter