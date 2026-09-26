import { Router } from "express";

import { createCustomer, getAllCustomers, getCustomerCreators, getFilteredCustomers, editCustomer, getCustomerByCustomerId, shareOrTransferCustomer, stopSharingCustomer, deleteCustomer, checkCompanyExists, updateCustomerStatus, updateCustomerAttachments, removeCustomerAttachment } from "../controllers/customer.controller";
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")
const cusRouter = Router()

cusRouter.use(requirePrivilege("customer"));

cusRouter.get('/creators',getCustomerCreators)
cusRouter.get('/checkCompanyExists', checkCompanyExists)
cusRouter.get('/:userId',getAllCustomers)
cusRouter.get('/view/get/:customerId', getCustomerByCustomerId)
cusRouter.post('/', requirePrivilege("customer", "create"), createCustomer)
cusRouter.post('/get',getFilteredCustomers)
cusRouter.patch('/edit', requireUnlessDenied("customer", "edit"), editCustomer)
// no dedicated privilege flag exists for customer edit/status yet — left under the
// base view gate above, same as editCustomer
cusRouter.patch('/status', requireUnlessDenied("customer", "edit"), updateCustomerStatus)
cusRouter.post('/delete', requireUnlessDenied("customer", "delete"), deleteCustomer)
// shareOrTransferCustomer covers both the "share" and "transfer" privilege
// flags depending on request body — left under the base view gate above
// rather than pinned to one flag, to avoid wrongly blocking either case.
cusRouter.patch('/shareOrTransferCustomer', shareOrTransferCustomer)
cusRouter.patch('/stopSharing', stopSharingCustomer)
cusRouter.patch('/:customerId/attachments', upload.array('files'), updateCustomerAttachments)
cusRouter.delete('/:customerId/attachments/:fileName', removeCustomerAttachment)

export default cusRouter;