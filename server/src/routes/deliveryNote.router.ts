import express from 'express';
import { generateDnNumber, createDn, getDnsByJobId, getAllDeliveryNotes, getDnById, cancelDn } from '../controllers/deliveryNote.controller';

const deliveryNoteRouter = express.Router();

deliveryNoteRouter.get('/generate-dn-number', generateDnNumber);
deliveryNoteRouter.post('/', createDn);
deliveryNoteRouter.get('/job/:jobId', getDnsByJobId);
deliveryNoteRouter.post('/get', getAllDeliveryNotes);
deliveryNoteRouter.get('/:id', getDnById);
deliveryNoteRouter.patch('/:id/cancel', cancelDn);

export default deliveryNoteRouter;
