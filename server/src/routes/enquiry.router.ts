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
    RejectPresaleJob,
    reAssignJob,
    returnPresaleJob,
    restartPresaleAssignment,
    resolveHeldPresaleAssignment,
    selfAssignPresaleJob,
    markAsSeenReAssingedJob,
    updateEnquiryAttachments,
    removeEnquiryAttachment,
    findSimilarEnquiries,
    getEnquiryReport,
    scheduleFollowUp,
    completeFollowUp,
    cancelFollowUp
} from "../controllers/enquiry.controller";
import { requirePrivilege, requireUnlessDenied } from "../common/middlewares/privilege.middleware";
import { requireEnquiryCreator } from "../common/middlewares/enquiry-creator.middleware";
const equiRouter = Router()

const chain = (...handlers: any[]) => (req: any, res: any, next: any) => {
    let index = 0;
    const step = (err?: any): any => (err || index >= handlers.length ? next(err) : handlers[index++](req, res, step));
    step();
};

// Editing an enquiry is for the person who created it, so every edit route also checks ownership.
// Admin is a read-only oversight tier here: only superAdmin skips the privilege flags on enquiry and presale actions.
const STRICT = { strictAdmin: true };

const editOwnEnquiry = [requireUnlessDenied("enquiry", "edit"), requireEnquiryCreator()];

// /update serves both sides: presales sending an estimated job back, and the enquiry owner closing or moving it on.
const updateStatusGate = (req: any, res: any, next: any) => {
    const status = String(req.body?.status || "").toLowerCase();
    return status === "work in progress" || status === "estimated"
        ? requireUnlessDenied("assignedJob", "estimate", STRICT)(req, res, next)
        : chain(...editOwnEnquiry)(req, res, next);
};

equiRouter.use(requirePrivilege("enquiry"));

equiRouter.post('/create', requirePrivilege("enquiry", "create", undefined, STRICT), upload.fields([{ name: 'attachments' }, { name: 'presaleFiles' }]), createEnquiry);
equiRouter.post('/get', getEnquiries);
equiRouter.get('/similar', findSimilarEnquiries);
equiRouter.post('/report', getEnquiryReport);
equiRouter.get('/presales', getPreSaleJobs);
equiRouter.post('/presales/report', getPresaleReport);
equiRouter.get('/presales/tab-counts', presaleTabCounts);
equiRouter.patch('/:enquiryId/send-to-presale', requireUnlessDenied("enquiry", "reassign", STRICT), sendToPresale);
equiRouter.patch('/:enquiryId/convert-to-quote', ...editOwnEnquiry, convertToQuote);
equiRouter.patch('/presales/:enquiryId', requirePrivilege("assignedJob", "assign", undefined, STRICT), upload.fields([{ name: 'newPresaleFile' }]), assignPresale);
equiRouter.patch('/:enquiryId/attachments', requireUnlessDenied("enquiry", "edit"), requireEnquiryCreator({ editableStatusOnly: true }), upload.array('files'), updateEnquiryAttachments);
equiRouter.delete('/:enquiryId/attachments/:fileName', requireUnlessDenied("enquiry", "edit"), requireEnquiryCreator({ editableStatusOnly: true }), removeEnquiryAttachment);
equiRouter.patch('/:enquiryId/follow-up/schedule', ...editOwnEnquiry, scheduleFollowUp);
equiRouter.patch('/:enquiryId/follow-up/complete', ...editOwnEnquiry, completeFollowUp);
equiRouter.patch('/:enquiryId/follow-up/cancel', ...editOwnEnquiry, cancelFollowUp);
equiRouter.put('/update', updateStatusGate, updateEnquiryStatus);
equiRouter.get('/monthly', monthlyEnquiries);
equiRouter.patch('/feedback-request', requireUnlessDenied("assignedJob", "estimate", STRICT), sendFeedbackRequest);
equiRouter.patch('/give-feedback', requireUnlessDenied("assignedJob", "assign", STRICT), giveFeedback);
equiRouter.patch('/revision/:enquiryId', requireUnlessDenied("enquiry", "reassign", STRICT), giveRevision);
equiRouter.patch('/quoteRevision/:enquiryId', requireUnlessDenied("enquiry", "reassign", STRICT), reviseQuoteEstimation);
equiRouter.get('/feedback-request/:employeeId', getFeedbackRequestsById);
equiRouter.post('/upload-estimation', requireUnlessDenied("assignedJob", "estimate", STRICT), uploadEstimations)
equiRouter.post('/markAsSeenEstimation', markAsSeenEstimation);
equiRouter.post('/markAsSeenedJob', markAsSeenJob);
equiRouter.post('/markAsSeenedReassingedJob', markAsSeenReAssingedJob);
equiRouter.post('/markAsSeenFeeback', markAsSeenFeedback);
equiRouter.patch('/markAsSeenFeebackResponse', markFeedbackResponseAsViewed);
equiRouter.get('/presales/count', presalesCount)
equiRouter.post('/delete', requireUnlessDenied("enquiry", "delete"), deleteEnquiry);
equiRouter.put('/presales/reject', requireUnlessDenied("assignedJob", "reject", STRICT), RejectPresaleJob)
equiRouter.put('/presales/return', requirePrivilege("assignedJob", "assign", undefined, STRICT), returnPresaleJob)
equiRouter.put('/presales/self-assign', requirePrivilege("assignedJob", "assign", undefined, STRICT), selfAssignPresaleJob)
equiRouter.put('/reassignjob', requirePrivilege("assignedJob", "assign", undefined, STRICT), reAssignJob)
equiRouter.put('/presales/resolve-assignment', requirePrivilege("assignedJob", "assign", undefined, STRICT), resolveHeldPresaleAssignment)
equiRouter.put('/presales/restart-assignment', requirePrivilege("assignedJob", "assign", undefined, STRICT), restartPresaleAssignment)


export default equiRouter;
