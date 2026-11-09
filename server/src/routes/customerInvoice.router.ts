import { Router } from 'express';
import { requirePrivilege, requireAnyPrivilege } from '../common/middlewares/privilege.middleware';
import { CustomerInvoice } from '../models/customerInvoice.model';
import { createCustomerInvoice, listCustomerInvoices, customerInvoicePo, customerInvoiceDn, listPdc, updatePdcStatus, getCustomerInvoice, updateCustomerInvoice } from '../controllers/customerInvoice.controller';
const router = Router();

// Invoices raised from a delivery note belong to Dispatch; the rest (proforma, supplier bill) to Finance.
// dispatch.createInvoice falls back to invoice.createInvoice on roles saved before the split.
const dispatchInvoice = requirePrivilege('dispatch', 'createInvoice', 'invoice.createInvoice');
const financeInvoice = requirePrivilege('invoice', 'createInvoice');
const bySource = (isDn: (req: any) => Promise<boolean> | boolean) => async (req: any, res: any, next: any) => {
    try {
        return ((await isDn(req)) ? dispatchInvoice : financeInvoice)(req, res, next);
    } catch {
        return res.status(500).json({ message: 'Failed to check access' });
    }
};

router.get('/', requirePrivilege('invoice'), listCustomerInvoices);
router.get('/pdc', requirePrivilege('invoice'), listPdc);
router.patch('/pdc/:id/status', requirePrivilege('invoice', 'pdcApprove'), updatePdcStatus);
router.get('/purchase-order/:id', financeInvoice, customerInvoicePo);
router.get('/delivery-note/:id', dispatchInvoice, customerInvoiceDn);
router.get('/:id', requireAnyPrivilege('invoice', 'dispatch'), getCustomerInvoice);
router.post('/', bySource((req) => !!req.body?.deliveryNote), createCustomerInvoice);
router.put('/:id', bySource(async (req) => !!(await CustomerInvoice.exists({ _id: req.params.id, deliveryNote: { $exists: true, $ne: null } }))), updateCustomerInvoice);
export default router;
