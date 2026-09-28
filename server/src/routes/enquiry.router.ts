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
    markAsSeenReAssingedJob,
    updateEnquiryAttachments,
    removeEnquiryAttachment,
    findSimilarEnquiries,
    getEnquiryReport,
    addFollowUp
} from "../controllers/enquiry.controller";
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";
const equiRouter = Router()

equiRouter.use(requirePrivilege("enquiry"));

equiRouter.post('/create', requirePrivilege("enquiry", "create"), upload.fields([{ name: 'attachments' }, { name: 'presaleFiles' }]), createEnquiry);
equiRouter.post('/get', getEnquiries);
equiRouter.get('/similar', findSimilarEnquiries);
equiRouter.post('/report', getEnquiryReport);
equiRouter.get('/presales', getPreSaleJobs);
equiRouter.post('/presales/report', getPresaleReport);
equiRouter.get('/presales/tab-counts', presaleTabCounts);
equiRouter.patch('/:enquiryId/send-to-presale', requireUnlessDenied("enquiry", "reassign"), sendToPresale);
equiRouter.patch('/presales/:enquiryId', requireUnlessDenied("enquiry", "reassign"), upload.fields([{ name: 'newPresaleFile' }]), assignPresale);
equiRouter.patch('/:enquiryId/attachments', requireUnlessDenied("enquiry", "edit"), upload.array('files'), updateEnquiryAttachments);
equiRouter.delete('/:enquiryId/attachments/:fileName', requireUnlessDenied("enquiry", "edit"), removeEnquiryAttachment);
equiRouter.patch('/:enquiryId/follow-up', requireUnlessDenied("enquiry", "edit"), addFollowUp);
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
equiRouter.put('/reassignjob', requirePrivilege("assignedJob", "assign"), reAssignJob)


export default equiRouter;
