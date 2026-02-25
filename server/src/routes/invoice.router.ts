import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber, getInvoiceDnLinkingReport, getCancelledAdjustedInvoices, getInvoiceById, updateInvoice, getCancelledAndReissuedInvoices } from '../controllers/invoice.controller';

const router = Router();

router.get('/dn-linking-report', getInvoiceDnLinkingReport);
router.get('/cancelled-reissued-report', getCancelledAndReissuedInvoices);
router.get('/audit', getCancelledAdjustedInvoices);
router.get('/generate-number', generateInvoiceNumber);
router.get('/:id', getInvoiceById);
router.put('/:id', updateInvoice);
router.get('/', getInvoices);
router.post('/', createInvoice);

export default router;
