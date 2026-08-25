import { Router } from "express";

import { createCustomer, getAllCustomers, getCustomerCreators, getFilteredCustomers, editCustomer, getCustomerByCustomerId, shareOrTransferCustomer, stopSharingCustomer, deleteCustomer } from "../controllers/customer.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const cusRouter = Router()

cusRouter.use(requirePrivilege("customer"));

cusRouter.get('/creators',getCustomerCreators)
cusRouter.get('/:userId',getAllCustomers)
cusRouter.get('/view/get/:customerId', getCustomerByCustomerId)
cusRouter.post('/', requirePrivilege("customer", "create"), createCustomer)
cusRouter.post('/get',getFilteredCustomers)
cusRouter.patch('/edit', editCustomer)
cusRouter.post('/delete', deleteCustomer)
// shareOrTransferCustomer covers both the "share" and "transfer" privilege
// flags depending on request body — left under the base view gate above
// rather than pinned to one flag, to avoid wrongly blocking either case.
cusRouter.patch('/shareOrTransferCustomer', shareOrTransferCustomer)
cusRouter.patch('/stopSharing', stopSharingCustomer)

export default cusRouter;