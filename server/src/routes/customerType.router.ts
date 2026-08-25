import { Router } from "express";

import {
    getCustomerTypes,
    createCustomerType,
    updateCustomerType,
    deleteDepartment
 } from "../controllers/customerType.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const customerTypeRouter = Router()

// GET / is a shared lookup used when creating customers — left ungated.
const manageCustomerType = requirePrivilege("portalManagement", "customerType");

customerTypeRouter.get('/', getCustomerTypes)
customerTypeRouter.post('/', manageCustomerType, createCustomerType)
customerTypeRouter.put('/', manageCustomerType, updateCustomerType)
customerTypeRouter.post('/delete-customerType', manageCustomerType, deleteDepartment)

export default customerTypeRouter