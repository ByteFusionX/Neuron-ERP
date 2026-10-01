import { Router } from "express";
const upload = require("../common/multer.storage")
import {
    createEnquiry,
    getEnquiries,
    getPreSaleJobs,
    getPresaleReport,
    updateEnquiryStatus,
    monthlyEnquiries,
    sendFeedbackRequest,
    getFeedbackRequestsById,
    giveFeedback,
    assignPresale,
    sendToPresale,
    convertToQuote,
    presaleTabCounts,
    giveRevision,
    reviseQuoteEstimation,
    presalesCount,
    markAsSeenJob,
    markAsSeenFeedback,
    markFeedbackResponseAsViewed,
    uploadEstimations,
    markAsSeenEstimation,
    deleteEnquiry,
    deleteEstimation,
    RejectPresaleJob,
    reAssignJob,
    returnPresaleJob,
    selfAssignPresaleJob,
    markAsSeenReAssingedJob,
    updateEnquiryAttachments,
    removeEnquiryAttachment,
    findSimilarEnquiries,
    getEnquiryReport,
    scheduleFollowUp,
    completeFollowUp,
    cancelFollowUp,
    getEnquiryHistory
} from "../controllers/enquiry.controller";
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";
const equiRouter = Router()

equiRouter.use(requirePrivilege("enquiry"));

equiRouter.post('/create', requirePrivilege("enquiry", "create"), upload.fields([{ name: 'attachments' }, { name: 'presaleFiles' }]), createEnquiry);
equiRouter.post('/get', getEnquiries);
equiRouter.get('/similar', findSimilarEnquiries);
equiRouter.get('/:enquiryId/history', getEnquiryHistory);
equiRouter.post('/report', getEnquiryReport);
equiRouter.get('/presales', getPreSaleJobs);
equiRouter.post('/presales/report', getPresaleReport);
equiRouter.get('/presales/tab-counts', presaleTabCounts);
equiRouter.patch('/:enquiryId/send-to-presale', requireUnlessDenied("enquiry", "reassign"), sendToPresale);
equiRouter.patch('/:enquiryId/convert-to-quote', requireUnlessDenied("enquiry", "edit"), convertToQuote);
equiRouter.patch('/presales/:enquiryId', requireUnlessDenied("enquiry", "reassign"), upload.fields([{ name: 'newPresaleFile' }]), assignPresale);
equiRouter.patch('/:enquiryId/attachments', requireUnlessDenied("enquiry", "edit"), upload.array('files'), updateEnquiryAttachments);
equiRouter.delete('/:enquiryId/attachments/:fileName', requireUnlessDenied("enquiry", "edit"), removeEnquiryAttachment);
equiRouter.patch('/:enquiryId/follow-up/schedule', requireUnlessDenied("enquiry", "edit"), scheduleFollowUp);
equiRouter.patch('/:enquiryId/follow-up/complete', requireUnlessDenied("enquiry", "edit"), completeFollowUp);
equiRouter.patch('/:enquiryId/follow-up/cancel', requireUnlessDenied("enquiry", "edit"), cancelFollowUp);
equiRouter.put('/update', requireUnlessDenied("enquiry", "edit"), updateEnquiryStatus);
equiRouter.get('/monthly', monthlyEnquiries);
equiRouter.patch('/feedback-request', requireUnlessDenied("enquiry", "feedback"), sendFeedbackRequest);
equiRouter.patch('/give-feedback', requireUnlessDenied("enquiry", "feedback"), giveFeedback);
equiRouter.patch('/revision/:enquiryId', requireUnlessDenied("enquiry", "revision"), giveRevision);
equiRouter.patch('/quoteRevision/:enquiryId', requireUnlessDenied("enquiry", "revision"), reviseQuoteEstimation);
equiRouter.get('/feedback-request/:employeeId', getFeedbackRequestsById);
equiRouter.post('/upload-estimation', uploadEstimations)
equiRouter.post('/markAsSeenEstimation', markAsSeenEstimation);
equiRouter.post('/markAsSeenedJob', markAsSeenJob);
equiRouter.post('/markAsSeenedReassingedJob', markAsSeenReAssingedJob);
equiRouter.post('/markAsSeenFeeback', markAsSeenFeedback);
equiRouter.patch('/markAsSeenFeebackResponse', markFeedbackResponseAsViewed);
equiRouter.get('/presales/count', presalesCount)
equiRouter.post('/delete', requireUnlessDenied("enquiry", "delete"), deleteEnquiry);
equiRouter.delete('/presales/estimation/:enqId', requireUnlessDenied("enquiry", "delete"), deleteEstimation)
equiRouter.put('/presales/reject', requireUnlessDenied("enquiry", "reassign"), RejectPresaleJob)
equiRouter.put('/presales/return', requirePrivilege("assignedJob", "assign"), returnPresaleJob)
equiRouter.put('/presales/self-assign', requirePrivilege("assignedJob", "assign"), selfAssignPresaleJob)
equiRouter.put('/reassignjob', requirePrivilege("assignedJob", "assign"), reAssignJob)


export default equiRouter;
