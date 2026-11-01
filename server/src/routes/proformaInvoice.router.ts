import { Router } from 'express';
import {
    getProformaInvoices, getProformaInvoiceById, createProformaInvoice, updateProformaInvoice,
    updateProformaInvoiceStatus, getNextProformaInvoiceNo,
} from '../controllers/proformaInvoice.controller';
import { requirePrivilege } from '../common/middlewares/privilege.middleware';

const upload = require('../common/multer.storage');

const router = Router();

// Reading follows the Invoice view scope; writing and status changes have their own flags.
router.use(requirePrivilege('invoice'));

router.get('/', getProformaInvoices);
router.get('/next-number', getNextProformaInvoiceNo);
router.get('/:id', getProformaInvoiceById);
router.post('/', requirePrivilege('invoice', 'piCreateEdit'), createProformaInvoice);
router.put('/:id', requirePrivilege('invoice', 'piCreateEdit'), updateProformaInvoice);
router.patch('/:id/status', requirePrivilege('invoice', 'piApprove'), upload.array('document', 1), updateProformaInvoiceStatus);

export default router;
