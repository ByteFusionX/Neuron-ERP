import { Router } from 'express';
import { createRfqFromPurchase, getRfqById, getRfqComparison, getRfqs } from '../controllers/rfq.controller';
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const rfqRouter = Router();

rfqRouter.use(requirePrivilege("purchase"));

rfqRouter.post('/', getRfqs);
rfqRouter.post('/from-purchase/:purchaseId', requirePrivilege("purchase", "create"), createRfqFromPurchase);
rfqRouter.get('/:id/compare', getRfqComparison);
rfqRouter.get('/:id', getRfqById);

export default rfqRouter;
