import { Router } from "express";

import { createCustomer, getAllCustomers, getCustomerCreators, getFilteredCustomers, editCustomer, getCustomerByCustomerId, shareOrTransferCustomer, stopSharingCustomer, deleteCustomer } from "../controllers/customer.controller";
import { authorize } from "../common/middlewares/authorize.middleware";
const cusRouter = Router()

cusRouter.get('/creators',getCustomerCreators)
cusRouter.get('/:userId',getAllCustomers)
cusRouter.get('/view/get/:customerId', getCustomerByCustomerId)
cusRouter.post('/',createCustomer)
cusRouter.post('/get',getFilteredCustomers)
cusRouter.patch('/edit', editCustomer)
cusRouter.post('/delete', deleteCustomer)
cusRouter.patch(
    '/shareOrTransferCustomer',
    authorize('customer', (req) => req.body.type === 'Transfer' ? 'transfer' : 'share'),
    shareOrTransferCustomer
)
cusRouter.patch('/stopSharing', authorize('customer', 'share'), stopSharingCustomer)

export default cusRouter;