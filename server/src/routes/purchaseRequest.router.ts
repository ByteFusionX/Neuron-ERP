import {Router} from 'express'
import { createPurchaseRequest, deletePurchaseRequest, generatePurchaseNumber, getPurchaseRequestById, getPurchaseRequestsByStatus, updateComparisonSummary, updatePurchaseRequest, updatePurchaseRequestStatus, updateSupplierDiscount } from '../controllers/purchaseRequest.controller'

const purchaseRequestRouter = Router()

purchaseRequestRouter.post('/', createPurchaseRequest)
purchaseRequestRouter.get('/status/:status', getPurchaseRequestsByStatus)
purchaseRequestRouter.get('/id/:id', getPurchaseRequestById)
purchaseRequestRouter.post('/generate-purchase-no', generatePurchaseNumber)
purchaseRequestRouter.patch('/status/:id', updatePurchaseRequestStatus)
purchaseRequestRouter.patch('/:id', updatePurchaseRequest)
purchaseRequestRouter.delete('/:id', deletePurchaseRequest)
purchaseRequestRouter.patch('/comparison/:id', updateComparisonSummary)
purchaseRequestRouter.patch('/supplier-discount/:id', updateSupplierDiscount)


export default purchaseRequestRouter;
