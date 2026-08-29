import express from 'express';
import { generateDnNumber, createDn, getDnsByJobId, getAllDeliveryNotes, getDnById, cancelDn, rejectDnItems, getInventoryDeductionReport, getDraftDnByJobId, updateDn, getPendingDeliveriesSummary, getPendingDeliveryDetails, getDnItemsForJob, getInvoiceLinkingSummary } from '../controllers/deliveryNote.controller';
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const deliveryNoteRouter = express.Router();

deliveryNoteRouter.use(requirePrivilege("dispatch"));

deliveryNoteRouter.get('/generate-dn-number', generateDnNumber);
deliveryNoteRouter.post('/', requirePrivilege("dispatch", "createDeliveryNote"), createDn);
deliveryNoteRouter.get('/job/:jobId', getDnsByJobId);
deliveryNoteRouter.get('/draft/:jobId', getDraftDnByJobId);
deliveryNoteRouter.post('/pending', requirePrivilege("dispatch", "viewPendingDelivery"), getPendingDeliveriesSummary);
deliveryNoteRouter.get('/pending/:jobId', requirePrivilege("dispatch", "viewPendingDelivery"), getPendingDeliveryDetails);
deliveryNoteRouter.get('/items-for-job/:jobId', getDnItemsForJob);
deliveryNoteRouter.put('/:id', updateDn);
deliveryNoteRouter.post('/get', getAllDeliveryNotes);
deliveryNoteRouter.get('/:id', getDnById);
deliveryNoteRouter.patch('/:id/cancel', cancelDn);
deliveryNoteRouter.patch('/:id/reject', rejectDnItems);
deliveryNoteRouter.post('/inventory-deduction-report', requirePrivilege("dispatch", "viewInventoryDeduction"), getInventoryDeductionReport);
deliveryNoteRouter.post('/invoice-linking', requirePrivilege("dispatch", "viewInvoiceLinking"), getInvoiceLinkingSummary);

export default deliveryNoteRouter;
