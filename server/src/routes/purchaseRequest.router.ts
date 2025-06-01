import { Router } from 'express'
import { createPurchaseRequest, generatePurchaseNumber, getPurchaseRequests } from '../controllers/purchaseRequest.controller'

const purchaseRequestRouter = Router()

purchaseRequestRouter.post('/purchase-request', createPurchaseRequest)
purchaseRequestRouter.post('/purchase-requests', getPurchaseRequests)
purchaseRequestRouter.get('/purchase-request/:status')
purchaseRequestRouter.get('/purchase-request/:id')
purchaseRequestRouter.get('/purchase-request/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.patch('/purchase-request/status/:id')
purchaseRequestRouter.patch('/purchase-request/:id')
purchaseRequestRouter.delete('/purchase-request/:id')
purchaseRequestRouter.patch('/purchase-request/comparison/:id')
purchaseRequestRouter.patch('/purchase-request/supplier-discount/:id')

export default purchaseRequestRouter;