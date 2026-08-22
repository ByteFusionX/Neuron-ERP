import { Router } from "express";
import {
    createClaim,
    getClaims,
    getApprovalsByEmployee,
    getClaimById,
    updateClaimAndSubmit,
    updateClaimStatus,
    markClaimAsPaid,
    deleteClaim,
    removeClaimAttachment
} from "../controllers/claim.controller";
const upload = require("../common/multer.storage")
const claimRouter = Router();

claimRouter.post('/',upload.fields([{ name: 'attachments' }]), createClaim);
claimRouter.get('/', getClaims);
claimRouter.get('/approvals', getApprovalsByEmployee);
claimRouter.get('/:id', getClaimById);
claimRouter.put('/:id',upload.fields([{ name: 'newAttachments' }]), updateClaimAndSubmit);
claimRouter.put('/:id/status', updateClaimStatus);
claimRouter.patch('/:id/mark-paid', markClaimAsPaid);
claimRouter.put('/:id/remove-attachment', removeClaimAttachment);
claimRouter.delete('/:id', deleteClaim);

export default claimRouter;

