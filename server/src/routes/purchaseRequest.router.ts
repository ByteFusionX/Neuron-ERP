import { Router } from 'express'
import {
    createPurchaseRequest,
    generatePurchaseNumber,
    getPurchaseRequestById,
    getPurchaseRequests,
    getPurchaseRequestsByStatus,
    getPurchaseRequestsByJobId,
    updatePurchaseRequestStatus,
    updatePurchaseRequest,
    updatePurchaseItems,
    updatePurchaseComparisons,
    updatePurchaseSupplierDiscounts,
    updatePurchaseMrRequest,
    getConvertibleJobs,
    mergeItemsToDealSheet,
    revokeMergedItems,
    getApprovalsByEmployee
} from '../controllers/purchaseRequest.controller'
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const purchaseRequestRouter = Router()

purchaseRequestRouter.use(requirePrivilege("purchase"));

purchaseRequestRouter.post('/purchase-request', requirePrivilege("purchase", "create"), createPurchaseRequest)
purchaseRequestRouter.post('/purchase-requests', getPurchaseRequests)
purchaseRequestRouter.get('/purchase-request/status/:id', getPurchaseRequestsByStatus)
purchaseRequestRouter.get('/purchase-request/job/:jobId', getPurchaseRequestsByJobId)
purchaseRequestRouter.get('/purchase-request/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.get('/purchase-request/convertible-jobs', getConvertibleJobs)
purchaseRequestRouter.get('/purchase-request/:id', getPurchaseRequestById)
purchaseRequestRouter.put('/purchase-update/:id', updatePurchaseRequest)
purchaseRequestRouter.patch('/purchase-request/status/:id', requirePrivilege("purchase", "canApprovePR"), updatePurchaseRequestStatus)
purchaseRequestRouter.patch('/purchase-request/items/:id', updatePurchaseItems)
purchaseRequestRouter.patch('/purchase-request/comparison/:id', updatePurchaseComparisons)
purchaseRequestRouter.patch('/purchase-request/supplier-discount/:id', updatePurchaseSupplierDiscounts)
purchaseRequestRouter.patch('/purchase-request/mr-request/:id', updatePurchaseMrRequest)
// merging PR items into a deal sheet is gated by the dealSheet flag too, on
// top of base purchase-module access.
purchaseRequestRouter.patch('/purchase-request/merge-items/:id', requirePrivilege("dealSheet"), mergeItemsToDealSheet)
purchaseRequestRouter.patch('/purchase-request/revoke-merge/:id', requirePrivilege("dealSheet"), revokeMergedItems)
purchaseRequestRouter.get('/purchase-request/approvals/employee', getApprovalsByEmployee)

export default purchaseRequestRouter;