import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber } from '../controllers/invoice.controller';

const router = Router();

router.get('/', getInvoices);
router.post('/', createInvoice);
router.get('/generate-number', generateInvoiceNumber);

export default router;
