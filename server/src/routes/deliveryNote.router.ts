import express from 'express';
import { generateDnNumber, createDn, getDnsByJobId, getAllDeliveryNotes, getReadyForDnReceipts, getDnById, getDnInvoice, cancelDn, completeDnPod, dispatchDn, rejectDnItems, getDraftDnByJobId, updateDn, getDnItemsForJob } from '../controllers/deliveryNote.controller';
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";

const upload = require("../common/multer.storage");

const deliveryNoteRouter = express.Router();

deliveryNoteRouter.use(requirePrivilege("dispatch"));

deliveryNoteRouter.get('/generate-dn-number', generateDnNumber);
deliveryNoteRouter.post('/', requirePrivilege("dispatch", "createDeliveryNote"), createDn);
deliveryNoteRouter.get('/job/:jobId', getDnsByJobId);
deliveryNoteRouter.get('/draft/:jobId', getDraftDnByJobId);
deliveryNoteRouter.get('/items-for-job/:jobId', getDnItemsForJob);
deliveryNoteRouter.get('/ready-for-dn', getReadyForDnReceipts);
deliveryNoteRouter.put('/:id', requireUnlessDenied("dispatch", "editDeliveryNote"), updateDn);
deliveryNoteRouter.post('/get', getAllDeliveryNotes);
deliveryNoteRouter.get('/:id/invoice', getDnInvoice);
deliveryNoteRouter.get('/:id', getDnById);
deliveryNoteRouter.patch('/:id/cancel', requireUnlessDenied("dispatch", "cancelDeliveryNote"), cancelDn);
deliveryNoteRouter.patch('/:id/dispatch', requireUnlessDenied("dispatch", "dispatchDeliveryNote"), dispatchDn);
deliveryNoteRouter.patch('/:id/pod', requireUnlessDenied("dispatch", "uploadPod"), upload.array('files'), completeDnPod);
deliveryNoteRouter.patch('/:id/reject', requireUnlessDenied("dispatch", "rejectDeliveryItems"), rejectDnItems);

export default deliveryNoteRouter;
