import { Router } from 'express';
import {
    addSalesRfqQuote,
    addSalesRfqSupplier,
    awardSalesRfqLines,
    awardEnquiryRfqLines,
    getEnquiryRfqComparison,
    prepareQuotationFromEnquiryRfqs,
    cancelSalesRfq,
    checkSalesRfqStock,
    closeSalesRfqFollowUp,
    getSalesRfqFxRates,
    getSalesRfqSupplierActivity,
    scheduleSalesRfqFollowUp,
    removeSalesRfqSupplier,
    submitSalesRfqSupplierReply,
    updateSalesRfqSupplier,
    uploadSalesRfqSupplierFiles,
    createSalesRfqFromEnquiry,
    getRfqPriceHistory,
    getSalesRfqDraft,
    getSalesRfqById,
    getSalesRfqs,
    getSalesRfqSummaries,
    prepareQuotationFromSalesRfq,
    removeSalesRfqQuote,
    searchSalesRfqSuppliers,
    settleSalesRfqLine,
    updateSalesRfq,
    updateSalesRfqQuote,
    uploadSalesRfqQuoteFiles,
} from '../controllers/salesRfq.controller';
import { requireAnyPrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage");

// Sales RFQ: supplier price and availability collected between an enquiry and its quotation.
// Both sales (enquiry) and presale (assignedJob) people work on it.
const salesRfqRouter = Router();

salesRfqRouter.use(requireAnyPrivilege("enquiry", "assignedJob", "quotation"));

salesRfqRouter.post('/list', getSalesRfqs);
salesRfqRouter.post('/summaries', getSalesRfqSummaries);
salesRfqRouter.get('/price-history', getRfqPriceHistory);
salesRfqRouter.get('/supplier-options', searchSalesRfqSuppliers);
salesRfqRouter.get('/fx-rates', getSalesRfqFxRates);
salesRfqRouter.post('/supplier-activity', getSalesRfqSupplierActivity);
salesRfqRouter.get('/draft/:enquiryId', getSalesRfqDraft);
salesRfqRouter.post('/stock-check', checkSalesRfqStock);
salesRfqRouter.post('/from-enquiry/:enquiryId', createSalesRfqFromEnquiry);
salesRfqRouter.get('/enquiry/:enquiryId/compare', getEnquiryRfqComparison);
salesRfqRouter.put('/enquiry/:enquiryId/award', awardEnquiryRfqLines);
salesRfqRouter.post('/enquiry/:enquiryId/prepare-quotation', prepareQuotationFromEnquiryRfqs);
salesRfqRouter.get('/:id', getSalesRfqById);
salesRfqRouter.put('/:id', updateSalesRfq);
salesRfqRouter.post('/:id/cancel', cancelSalesRfq);
salesRfqRouter.post('/:id/quotes', addSalesRfqQuote);
salesRfqRouter.put('/:id/quotes/:quoteId', updateSalesRfqQuote);
salesRfqRouter.delete('/:id/quotes/:quoteId', removeSalesRfqQuote);
salesRfqRouter.post('/:id/quotes/:quoteId/files', upload.array('files'), uploadSalesRfqQuoteFiles);
salesRfqRouter.put('/:id/lines/:lineKey', settleSalesRfqLine);
salesRfqRouter.put('/:id/award', awardSalesRfqLines);
salesRfqRouter.post('/:id/suppliers', addSalesRfqSupplier);
salesRfqRouter.put('/:id/suppliers/:inviteId', updateSalesRfqSupplier);
salesRfqRouter.delete('/:id/suppliers/:inviteId', removeSalesRfqSupplier);
salesRfqRouter.post('/:id/suppliers/:inviteId/reply', submitSalesRfqSupplierReply);
salesRfqRouter.post('/:id/suppliers/:inviteId/files', upload.array('files'), uploadSalesRfqSupplierFiles);
salesRfqRouter.post('/:id/prepare-quotation', prepareQuotationFromSalesRfq);
salesRfqRouter.post('/:id/follow-ups', scheduleSalesRfqFollowUp);
salesRfqRouter.put('/:id/follow-ups/:followUpId', closeSalesRfqFollowUp);

export default salesRfqRouter;
