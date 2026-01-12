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

const purchaseRequestRouter = Router()

purchaseRequestRouter.post('/purchase-request', createPurchaseRequest)
purchaseRequestRouter.post('/purchase-requests', getPurchaseRequests)
purchaseRequestRouter.get('/purchase-request/status/:id', getPurchaseRequestsByStatus)
purchaseRequestRouter.get('/purchase-request/job/:jobId', getPurchaseRequestsByJobId)
purchaseRequestRouter.get('/purchase-request/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.get('/purchase-request/convertible-jobs', getConvertibleJobs)
purchaseRequestRouter.get('/purchase-request/:id', getPurchaseRequestById)
purchaseRequestRouter.put('/purchase-update/:id', updatePurchaseRequest)
purchaseRequestRouter.patch('/purchase-request/status/:id', updatePurchaseRequestStatus)
purchaseRequestRouter.patch('/purchase-request/items/:id', updatePurchaseItems)
purchaseRequestRouter.patch('/purchase-request/comparison/:id', updatePurchaseComparisons)
purchaseRequestRouter.patch('/purchase-request/supplier-discount/:id', updatePurchaseSupplierDiscounts)
purchaseRequestRouter.patch('/purchase-request/mr-request/:id', updatePurchaseMrRequest)
purchaseRequestRouter.patch('/purchase-request/merge-items/:id', mergeItemsToDealSheet)
purchaseRequestRouter.patch('/purchase-request/revoke-merge/:id', revokeMergedItems)
purchaseRequestRouter.get('/purchase-request/approvals/employee', getApprovalsByEmployee)

export default purchaseRequestRouter;