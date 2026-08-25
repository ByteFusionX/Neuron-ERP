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
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const depRouter = Router()

// GET routes here are shared lookups used to populate dropdowns elsewhere
// (customer/enquiry forms), not the "manage departments" admin action —
// only mutations are gated behind portalManagement.department.
const manageDept = requirePrivilege("portalManagement", "department");

depRouter.get('/', getDepartments)
depRouter.post('/', manageDept, createDepartment)
depRouter.put('/', manageDept, updateDepartment)
depRouter.post('/delete-department', manageDept, deleteDepartment)

depRouter.get('/customer', getCustomerDepartments)
depRouter.post('/customer', manageDept, createCustomerDepartment)
depRouter.put('/customer', manageDept, updateCustomerDepartment)
depRouter.post('/delete-customer', manageDept, deleteCustomerDepartment)

depRouter.get('/enquiry-count', totalEnquiries);

depRouter.get('/internalDepartment', getInternalDepartments)
depRouter.post('/internalDepartment', manageDept, createInternalDepartment)
depRouter.put('/internalDepartment', manageDept, updateInternalDepartment)
depRouter.post('/delete-internalDepartment', manageDept, deleteInternalDepartment)

export default depRouter;