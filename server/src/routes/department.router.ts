import { Router } from "express";
import {
    createCustomerDepartment,
    createDepartment,
    createInternalDepartment,
    getCustomerDepartments,
    getDepartments,
    getInternalDepartments,
    totalEnquiries,
    updateCustomerDepartment,
    updateDepartment,
    updateInternalDepartment,
    deleteDepartment,
    deleteInternalDepartment,
    deleteCustomerDepartment
} from "../controllers/department.controller";
const depRouter = Router()

depRouter.get('/', getDepartments)
depRouter.post('/', createDepartment)
depRouter.put('/', updateDepartment)
depRouter.post('/delete-department', deleteDepartment) 

depRouter.get('/customer', getCustomerDepartments)
depRouter.post('/customer', createCustomerDepartment)
depRouter.put('/customer', updateCustomerDepartment)
depRouter.post('/delete-customer', deleteCustomerDepartment)

depRouter.get('/enquiry-count', totalEnquiries);

depRouter.get('/internalDepartment', getInternalDepartments)
depRouter.post('/internalDepartment', createInternalDepartment)
depRouter.put('/internalDepartment', updateInternalDepartment)
depRouter.post('/delete-internalDepartment', deleteInternalDepartment) 

export default depRouter;