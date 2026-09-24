import { Router } from "express";

import {
    getCustomerTypes,
    createCustomerType,
    updateCustomerType,
    deleteDepartment,
    getCustomerTypeUsage
 } from "../controllers/customerType.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

import { auditMasterData } from "../common/middlewares/masterDataAudit.middleware";
const customerTypeRouter = Router()
customerTypeRouter.use(auditMasterData(() => 'Customer Type'))

// GET / is a shared lookup used when creating customers — left ungated.
const manageCustomerType = requirePrivilege("portalManagement", "customerType");

customerTypeRouter.get('/', getCustomerTypes)
customerTypeRouter.get('/usage', getCustomerTypeUsage)
customerTypeRouter.post('/', manageCustomerType, createCustomerType)
customerTypeRouter.put('/', manageCustomerType, updateCustomerType)
customerTypeRouter.post('/delete-customerType', manageCustomerType, deleteDepartment)

export default customerTypeRouter