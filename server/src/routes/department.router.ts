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
// the HR-only reads (audit, headcount, org chart) need `view`; mutations need create / edit / delete.
const viewDept = requirePrivilege("departments", "view", "portalManagement.department");
const createDept = requirePrivilege("departments", "create", "portalManagement.department");
const editDept = requirePrivilege("departments", "edit", "portalManagement.department");
const deleteDept = requirePrivilege("departments", "delete", "portalManagement.department");

depRouter.get('/audit', viewDept, getMasterDataAudit)
depRouter.get('/', getDepartments)
depRouter.post('/', createDept, createDepartment)
depRouter.put('/', editDept, updateDepartment)
depRouter.post('/delete-department', deleteDept, deleteDepartment)

depRouter.get('/customer', getCustomerDepartments)
depRouter.post('/customer', createDept, createCustomerDepartment)
depRouter.put('/customer', editDept, updateCustomerDepartment)
depRouter.post('/delete-customer', deleteDept, deleteCustomerDepartment)

depRouter.get('/usage', getDepartmentUsage)
depRouter.get('/enquiry-count', totalEnquiries);

depRouter.get('/internalDepartment', getInternalDepartments)
depRouter.get('/internalDepartment/headcount', viewDept, getInternalDepartmentHeadcount)
depRouter.get('/internalDepartment/:id/org-chart', viewDept, getInternalDepartmentOrgChart)
depRouter.post('/internalDepartment', createDept, createInternalDepartment)
depRouter.put('/internalDepartment', editDept, updateInternalDepartment)
depRouter.post('/delete-internalDepartment', deleteDept, deleteInternalDepartment)

export default depRouter;