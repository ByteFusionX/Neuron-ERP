import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber, getInvoiceDnLinkingReport, getCancelledAdjustedInvoices, getInvoiceById, updateInvoice, getCancelledAndReissuedInvoices, getJobItemInvoicedQty, cancelInvoice, cancelAndReissueInvoice, rejectInvoiceByCustomer } from '../controllers/invoice.controller';

const router = Router();

router.get('/dn-linking-report', getInvoiceDnLinkingReport);
router.get('/cancelled-reissued-report', getCancelledAndReissuedInvoices);
router.get('/audit', getCancelledAdjustedInvoices);
router.get('/generate-number', generateInvoiceNumber);
router.get('/item-invoiced-qty/:jobId', getJobItemInvoicedQty);
router.patch('/:id/cancel', cancelInvoice);
router.patch('/:id/reject', rejectInvoiceByCustomer);
router.post('/:id/cancel-reissue', cancelAndReissueInvoice);
router.get('/:id', getInvoiceById);
router.put('/:id', updateInvoice);
router.get('/', getInvoices);
router.post('/', createInvoice);

export default router;
