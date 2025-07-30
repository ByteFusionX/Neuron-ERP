import { Router } from 'express'
import {
    createPurchaseRequest,
    generatePurchaseNumber,
    getPurchaseRequestById,
    getPurchaseRequests,
    getPurchaseRequestsByStatus,
    getPurchaseRequestsByJobId,
    updatePurchaseRequestStatus
} from '../controllers/purchaseRequest.controller'

const purchaseRequestRouter = Router()

purchaseRequestRouter.post('/purchase-request', createPurchaseRequest)
purchaseRequestRouter.post('/purchase-requests', getPurchaseRequests)
purchaseRequestRouter.get('/purchase-request/status/:id', getPurchaseRequestsByStatus)
purchaseRequestRouter.get('/purchase-request/job/:jobId', getPurchaseRequestsByJobId)
purchaseRequestRouter.get('/purchase-request/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.get('/purchase-request/:id', getPurchaseRequestById)
purchaseRequestRouter.patch('/purchase-request/status/:id', updatePurchaseRequestStatus)
purchaseRequestRouter.patch('/purchase-request/:id')
purchaseRequestRouter.delete('/purchase-request/:id')
purchaseRequestRouter.patch('/purchase-request/comparison/:id')
purchaseRequestRouter.patch('/purchase-request/supplier-discount/:id')

export default purchaseRequestRouter;