import {Router} from 'express'

const purchaseRequestRouter = Router()

purchaseRequestRouter.post('/purchase-request')
purchaseRequestRouter.get('/purchase-request/:status')
purchaseRequestRouter.get('/purchase-request/:id')
purchaseRequestRouter.post('/purchase-request/generate-purchase-no')
purchaseRequestRouter.patch('/purchase-request/status/:id')
purchaseRequestRouter.patch('/purchase-request/:id')
purchaseRequestRouter.delete('/purchase-request/:id')
purchaseRequestRouter.patch('/purchase-request/comparison/:id')
purchaseRequestRouter.patch('/purchase-request/supplier-discount/:id')
