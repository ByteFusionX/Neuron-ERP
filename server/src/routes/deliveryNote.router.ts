import express from 'express';
import { generateDnNumber, createDn, getDnsByJobId, getAllDeliveryNotes, getDnById, cancelDn, getInventoryDeductionReport, getDraftDnByJobId, updateDn, getPendingDeliveriesSummary, getPendingDeliveryDetails, getDnItemsForJob } from '../controllers/deliveryNote.controller';

const deliveryNoteRouter = express.Router();

deliveryNoteRouter.get('/generate-dn-number', generateDnNumber);
deliveryNoteRouter.post('/', createDn);
deliveryNoteRouter.get('/job/:jobId', getDnsByJobId);
deliveryNoteRouter.get('/draft/:jobId', getDraftDnByJobId);
deliveryNoteRouter.post('/pending', getPendingDeliveriesSummary);
deliveryNoteRouter.get('/pending/:jobId', getPendingDeliveryDetails);
deliveryNoteRouter.get('/items-for-job/:jobId', getDnItemsForJob);
deliveryNoteRouter.put('/:id', updateDn);
deliveryNoteRouter.post('/get', getAllDeliveryNotes);
deliveryNoteRouter.get('/:id', getDnById);
deliveryNoteRouter.patch('/:id/cancel', cancelDn);
deliveryNoteRouter.post('/inventory-deduction-report', getInventoryDeductionReport);

export default deliveryNoteRouter;
