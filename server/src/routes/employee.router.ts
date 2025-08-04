import { Router } from "express";
import { createEmployee, getEmployees, login, getEmployee, getFilteredEmployees, editEmployee, getEmployeeByEmployeId, isEmployeePresent, getNotificationCounts, setTarget, updateTarget, getEmployeesForCustomerTransfer, deleteEmployee, getPresaleEngineers, getPresaleManagers, blockEmployee } from "../controllers/employee.controller";
const empRouter = Router()

empRouter.get('/', getEmployees)
empRouter.get('/presale-managers', getPresaleManagers)
empRouter.get('/presale-engineers', getPresaleEngineers)

empRouter.get('/check', isEmployeePresent)
empRouter.get('/view/get/:employeeId', getEmployeeByEmployeId)
empRouter.post('/get', getFilteredEmployees)
empRouter.post('/', createEmployee)
empRouter.patch('/changePasswordOfEmployee',)
empRouter.patch('/edit', editEmployee)
empRouter.patch('/setTarget/:employeeId', setTarget)
empRouter.patch('/update-target/:employeeId/:targetId', updateTarget)
empRouter.post('/login', login)
empRouter.get('/get/:id', getEmployee)
empRouter.get('/notifications/:token', getNotificationCounts)
empRouter.post('/delete', deleteEmployee)
empRouter.get('/no-customer-access/:customerId/:userId', getEmployeesForCustomerTransfer)
empRouter.patch('/block/:employeeId', blockEmployee)

export default empRouter;