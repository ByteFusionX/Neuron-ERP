import { Router } from 'express';
import { getRfqById, getRfqComparison, getRfqs } from '../controllers/rfq.controller';
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const rfqRouter = Router();

rfqRouter.use(requirePrivilege("purchase"));

rfqRouter.post('/', getRfqs);
rfqRouter.get('/:id/compare', getRfqComparison);
rfqRouter.get('/:id', getRfqById);

export default rfqRouter;
