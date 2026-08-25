import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber, getInvoiceDnLinkingReport, getCancelledAdjustedInvoices, getInvoiceById, updateInvoice, getCancelledAndReissuedInvoices, getJobItemInvoicedQty, cancelInvoice, cancelAndReissueInvoice, rejectInvoiceByCustomer } from '../controllers/invoice.controller';
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const router = Router();

router.use(requirePrivilege("invoice"));

router.get('/dn-linking-report', requirePrivilege("invoice", "viewInvoicesVsDn"), getInvoiceDnLinkingReport);
router.get('/cancelled-reissued-report', requirePrivilege("invoice", "viewReissued"), getCancelledAndReissuedInvoices);
router.get('/audit', requirePrivilege("invoice", "viewCancelledAdjusted"), getCancelledAdjustedInvoices);
router.get('/generate-number', generateInvoiceNumber);
router.get('/item-invoiced-qty/:jobId', getJobItemInvoicedQty);
router.patch('/:id/cancel', cancelInvoice);
router.patch('/:id/reject', rejectInvoiceByCustomer);
router.post('/:id/cancel-reissue', cancelAndReissueInvoice);
router.get('/:id', getInvoiceById);
router.put('/:id', updateInvoice);
router.get('/', getInvoices);
router.post('/', requirePrivilege("invoice", "createInvoice"), createInvoice);

export default router;
