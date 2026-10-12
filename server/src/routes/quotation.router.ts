import { Router } from "express";
import {
    approveDeal,
    getApprovedDealSheet,
    getDealSheet,
    getNextQuoteId,
    getProductSuggestions,
    getQuotations,
    getQuotationById,
    getQuoteNote,
    getQuoteRevisions,
    getReportDetails,
    markAsQuotationSeened,
    markAsSeenDeal,
    rejectDeal,
    removeLpo,
    revokeDeal,
    resetDealWorkflow,
    saveDealSheet,
    saveQuotation,
    totalQuotation,
    updateQuotation,
    updateQuoteStatus,
    uploadLpo,
    deleteQuotation,
    recordCustomerDecision,
    sendQuote,
    updateOptionalItemDecisions,
    updateQuoteFollowUp,
    scheduleQuoteFollowUp,
    completeQuoteFollowUp,
    cancelQuoteFollowUp,
} from "../controllers/quotation.controller";
import { requireAnyPrivilege, requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";
import { getQuoteStockHold, holdQuoteStock, releaseQuoteStockHold } from "../controllers/quoteStockHold.controller";

const quoteRouter = Router()
const upload = require("../common/multer.storage")

// Product picker used by item entry (presale estimation, quotation, deal sheet, purchase).
quoteRouter.get('/product-suggestions', requireAnyPrivilege("quotation", "assignedJob", "dealSheet", "purchase"), getProductSuggestions)

// Converting a won quote into a deal sheet is done by the quote's own owner,
// so it's gated by the same `quotation.create` privilege as creating the
// quote in the first place - not by `dealSheet`, which is reserved for
// approval-side actions (approve/reject/revoke/view pending & approved).
quoteRouter.patch('/deal/:quoteId', requirePrivilege("quotation", "create"), upload.array('attachments'), saveDealSheet)
quoteRouter.post('/deal/approve', requirePrivilege("dealSheet"), approveDeal)
quoteRouter.post('/deal/reject', requirePrivilege("dealSheet"), rejectDeal)
quoteRouter.post('/deal/revoke', requirePrivilege("dealSheet"), revokeDeal)
quoteRouter.post('/deal/reset-workflow', requirePrivilege("dealSheet"), resetDealWorkflow)
quoteRouter.post('/deal/get', requirePrivilege("dealSheet"), getDealSheet)
quoteRouter.post('/deal/approved/get', requirePrivilege("dealSheet"), getApprovedDealSheet)

quoteRouter.use(requirePrivilege("quotation"));

quoteRouter.post('/', requirePrivilege("quotation", "create"), saveQuotation)
quoteRouter.post('/lpo', requireUnlessDenied("quotation", "lpo"), upload.array('files'), uploadLpo)
quoteRouter.patch('/status/:quoteId', requireUnlessDenied("quotation", "statusUpdate"), updateQuoteStatus)
quoteRouter.patch('/update/:quoteId', requireUnlessDenied("quotation", "edit"), updateQuotation)
quoteRouter.post('/send/:quoteId', requireUnlessDenied("quotation", "statusUpdate"), sendQuote)
quoteRouter.patch('/follow-up/:quoteId', requireUnlessDenied("quotation", "edit"), updateQuoteFollowUp)
quoteRouter.patch('/follow-up/:quoteId/schedule', requireUnlessDenied("quotation", "edit"), scheduleQuoteFollowUp)
quoteRouter.patch('/follow-up/:quoteId/complete', requireUnlessDenied("quotation", "edit"), completeQuoteFollowUp)
quoteRouter.patch('/follow-up/:quoteId/cancel', requireUnlessDenied("quotation", "edit"), cancelQuoteFollowUp)
quoteRouter.patch('/customer-decision/:quoteId', requireUnlessDenied("quotation", "statusUpdate"), recordCustomerDecision)
quoteRouter.patch('/optional-decisions/:quoteId', requireUnlessDenied("quotation", "edit"), updateOptionalItemDecisions)
quoteRouter.get('/stock-hold/:quoteId', getQuoteStockHold)
quoteRouter.post('/stock-hold/:quoteId', requireUnlessDenied("quotation", "statusUpdate"), holdQuoteStock)
quoteRouter.delete('/stock-hold/:quoteId', requireUnlessDenied("quotation", "statusUpdate"), releaseQuoteStockHold)
quoteRouter.post('/get', getQuotations)
quoteRouter.post('/get/:id', getQuotationById)
quoteRouter.get('/note/:quoteId', getQuoteNote)
quoteRouter.get('/revisions/:quoteId', getQuoteRevisions)
quoteRouter.post('/report', getReportDetails)
quoteRouter.get('/total', totalQuotation)
quoteRouter.post('/nextQuoteId', getNextQuoteId)
quoteRouter.post('/markAsSeenedDeal', markAsSeenDeal);
quoteRouter.post('/markAsQuotationSeened', markAsQuotationSeened);
quoteRouter.post('/delete', requireUnlessDenied("quotation", "delete"), deleteQuotation);
quoteRouter.delete('/lpo/:quoteId/:fileName', requireUnlessDenied("quotation", "lpo"), removeLpo);

export default quoteRouter;
