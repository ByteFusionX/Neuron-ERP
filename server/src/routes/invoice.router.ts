import { Router } from 'express';
import { getInvoices, createInvoice, generateInvoiceNumber, getInvoiceDnLinkingReport, getCancelledAdjustedInvoices, getInvoiceById, getInvoiceByInvoiceNo, updateInvoice, getCancelledAndReissuedInvoices, getJobItemInvoicedQty, cancelInvoice, cancelAndReissueInvoice, rejectInvoiceByCustomer } from '../controllers/invoice.controller';
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";

const router = Router();

router.use(requirePrivilege("invoice"));

router.get('/dn-linking-report', getInvoiceDnLinkingReport);
router.get('/cancelled-reissued-report', getCancelledAndReissuedInvoices);
router.get('/audit', getCancelledAdjustedInvoices);
router.get('/generate-number', generateInvoiceNumber);
router.get('/item-invoiced-qty/:jobId', getJobItemInvoicedQty);
router.get('/by-invoice-no/:invoiceNo', getInvoiceByInvoiceNo);
router.patch('/:id/cancel', requireUnlessDenied("invoice", "cancelInvoice"), cancelInvoice);
router.patch('/:id/reject', requireUnlessDenied("invoice", "rejectInvoice"), rejectInvoiceByCustomer);
router.post('/:id/cancel-reissue', requireUnlessDenied("invoice", "reissueInvoice"), cancelAndReissueInvoice);
router.get('/:id', getInvoiceById);
router.put('/:id', requireUnlessDenied("invoice", "editInvoice"), updateInvoice);
router.get('/', getInvoices);
router.post('/', requirePrivilege("invoice", "createInvoice"), createInvoice);

export default router;
