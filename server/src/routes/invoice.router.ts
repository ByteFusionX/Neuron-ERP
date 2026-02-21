import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber, getInvoiceDnLinkingReport, getCancelledAdjustedInvoices } from '../controllers/invoice.controller';

const router = Router();

router.get('/dn-linking-report', getInvoiceDnLinkingReport);
router.get('/audit', getCancelledAdjustedInvoices);
router.get('/', getInvoices);
router.post('/', createInvoice);
router.get('/generate-number', generateInvoiceNumber);

export default router;
