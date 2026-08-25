import { Router } from "express";
import {
    approveDeal,
    getApprovedDealSheet,
    getDealSheet,
    getNextQuoteId,
    getQuotations,
    getQuoteNote,
    getReportDetails,
    markAsQuotationSeened,
    markAsSeenDeal,
    rejectDeal,
    removeLpo,
    revokeDeal,
    saveDealSheet,
    saveQuotation,
    totalQuotation,
    updateQuotation,
    updateQuoteStatus,
    uploadLpo,
    deleteQuotation,
} from "../controllers/quotation.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const quoteRouter = Router()
const upload = require("../common/multer.storage")

quoteRouter.use(requirePrivilege("quotation"));

quoteRouter.post('/', requirePrivilege("quotation", "create"), saveQuotation)
quoteRouter.post('/lpo', upload.array('files'), uploadLpo)
quoteRouter.patch('/status/:quoteId', updateQuoteStatus)
quoteRouter.patch('/update/:quoteId', updateQuotation)
// Converting a won quote into a deal sheet is done by the quote's own owner,
// so it's gated by the same `quotation.create` privilege as creating the
// quote in the first place - not by `dealSheet`, which is reserved for
// approval-side actions (approve/reject/revoke/view pending & approved).
quoteRouter.patch('/deal/:quoteId', requirePrivilege("quotation", "create"), upload.array('attachments'), saveDealSheet)
quoteRouter.post('/deal/approve', requirePrivilege("dealSheet"), approveDeal)
quoteRouter.post('/deal/reject', requirePrivilege("dealSheet"), rejectDeal)
quoteRouter.post('/deal/revoke', requirePrivilege("dealSheet"), revokeDeal)
quoteRouter.post('/deal/get', requirePrivilege("dealSheet"), getDealSheet)
quoteRouter.post('/deal/approved/get', requirePrivilege("dealSheet"), getApprovedDealSheet)
quoteRouter.post('/get', getQuotations)
quoteRouter.get('/note/:quoteId', getQuoteNote)
quoteRouter.post('/report', getReportDetails)
quoteRouter.get('/total', totalQuotation)
quoteRouter.post('/nextQuoteId', getNextQuoteId)
quoteRouter.post('/markAsSeenedDeal', markAsSeenDeal);
quoteRouter.post('/markAsQuotationSeened', markAsQuotationSeened);
quoteRouter.post('/delete', deleteQuotation);
quoteRouter.delete('/lpo/:quoteId/:fileName', removeLpo);

export default quoteRouter;