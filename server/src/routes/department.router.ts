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
    deleteCustomerDepartment,
    getInternalDepartmentHeadcount,
    getInternalDepartmentOrgChart,
    getDepartmentUsage
} from "../controllers/department.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
import { auditMasterData } from "../common/middlewares/masterDataAudit.middleware";
import { getMasterDataAudit } from "../controllers/masterDataAudit.controller";
const depRouter = Router()

depRouter.use(auditMasterData((req) =>
    req.path.includes('internalDepartment') ? 'Internal Department'
    : req.path.includes('customer') ? 'Customer Department' : 'Sales Department'))

// GET routes here are shared lookups used to populate dropdowns elsewhere
// (customer/enquiry forms), not the "manage departments" admin action —
// only mutations are gated behind portalManagement.department.
const manageDept = requirePrivilege("portalManagement", "department");

depRouter.get('/audit', manageDept, getMasterDataAudit)
depRouter.get('/', getDepartments)
depRouter.post('/', manageDept, createDepartment)
depRouter.put('/', manageDept, updateDepartment)
depRouter.post('/delete-department', manageDept, deleteDepartment)

depRouter.get('/customer', getCustomerDepartments)
depRouter.post('/customer', manageDept, createCustomerDepartment)
depRouter.put('/customer', manageDept, updateCustomerDepartment)
depRouter.post('/delete-customer', manageDept, deleteCustomerDepartment)

depRouter.get('/usage', getDepartmentUsage)
depRouter.get('/enquiry-count', totalEnquiries);

depRouter.get('/internalDepartment', getInternalDepartments)
depRouter.get('/internalDepartment/headcount', getInternalDepartmentHeadcount)
depRouter.get('/internalDepartment/:id/org-chart', getInternalDepartmentOrgChart)
depRouter.post('/internalDepartment', manageDept, createInternalDepartment)
depRouter.put('/internalDepartment', manageDept, updateInternalDepartment)
depRouter.post('/delete-internalDepartment', manageDept, deleteInternalDepartment)

export default depRouter;