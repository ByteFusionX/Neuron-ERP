import { Router } from 'express'
import {
    changePurchaseFollowUp,
    createPurchaseRequest,
    generatePurchaseNumber,
    getPurchaseRequestById,
    getPurchaseRequests,
    getPurchaseRequestCounts,
    getPurchaseRequestsByStatus,
    getPurchaseRequestsByJobId,
    updatePurchaseRequestStatus,
    updatePurchaseRequest,
    updatePurchaseItems,
    updatePurchaseSupplierOffers,
    updatePurchaseMrRequest,
    getConvertibleJobs,
    mergeItemsToDealSheet,
    revokeMergedItems,
    getApprovalsByEmployee,
    resetPurchaseWorkflow,
    revokePurchaseRequest,
    awardPurchaseLines,
    getSupplierPrices
} from '../controllers/purchaseRequest.controller'
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";

const purchaseRequestRouter = Router()

purchaseRequestRouter.use(requirePrivilege("purchase"));

purchaseRequestRouter.post('/purchase-request/:id/follow-up/:action', changePurchaseFollowUp)
purchaseRequestRouter.post('/purchase-request', requirePrivilege("purchase", "create"), createPurchaseRequest)
purchaseRequestRouter.post('/purchase-requests', getPurchaseRequests)
purchaseRequestRouter.post('/purchase-requests/counts', getPurchaseRequestCounts)
purchaseRequestRouter.get('/purchase-request/status/:id', getPurchaseRequestsByStatus)
purchaseRequestRouter.get('/purchase-request/job/:jobId', getPurchaseRequestsByJobId)
purchaseRequestRouter.get('/purchase-request/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.get('/purchase-request/convertible-jobs', getConvertibleJobs)
purchaseRequestRouter.get('/supplier-prices', getSupplierPrices)
purchaseRequestRouter.get('/purchase-request/:id',getPurchaseRequestById)
purchaseRequestRouter.patch('/purchase-request/award/:id', requireUnlessDenied("purchase", "award"), awardPurchaseLines)
purchaseRequestRouter.put('/purchase-update/:id', requireUnlessDenied("purchase", "edit"), updatePurchaseRequest)
purchaseRequestRouter.patch('/purchase-request/status/:id', requirePrivilege("purchase", "canApprovePR"), updatePurchaseRequestStatus)
purchaseRequestRouter.post('/purchase-request/revoke/:id', requirePrivilege("purchase", "canApprovePR"), revokePurchaseRequest)
purchaseRequestRouter.post('/purchase-request/reset-workflow/:id', requireUnlessDenied("purchase", "resetWorkflow"), resetPurchaseWorkflow)
purchaseRequestRouter.patch('/purchase-request/items/:id', requireUnlessDenied("purchase", "edit"), updatePurchaseItems)
purchaseRequestRouter.patch('/purchase-request/supplier-offers/:id', requireUnlessDenied("purchase", "edit"), updatePurchaseSupplierOffers)
purchaseRequestRouter.patch('/purchase-request/mr-request/:id', requireUnlessDenied("purchase", "edit"), updatePurchaseMrRequest)
// merging PR items into a deal sheet is gated by the dealSheet flag too, on
// top of base purchase-module access.
purchaseRequestRouter.patch('/purchase-request/merge-items/:id', requirePrivilege("dealSheet"), mergeItemsToDealSheet)
purchaseRequestRouter.patch('/purchase-request/revoke-merge/:id', requirePrivilege("dealSheet"), revokeMergedItems)
purchaseRequestRouter.get('/purchase-request/approvals/employee', getApprovalsByEmployee)

export default purchaseRequestRouter;
