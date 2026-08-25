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
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")
const claimRouter = Router();

claimRouter.use(requirePrivilege("claims"));

claimRouter.post('/',upload.fields([{ name: 'attachments' }]), createClaim);
claimRouter.get('/', getClaims);
claimRouter.get('/approvals', getApprovalsByEmployee);
claimRouter.get('/:id', getClaimById);
claimRouter.put('/:id',upload.fields([{ name: 'newAttachments' }]), updateClaimAndSubmit);
claimRouter.put('/:id/status', requirePrivilege("claims", "canApprove"), updateClaimStatus);
claimRouter.patch('/:id/mark-paid', requirePrivilege("claims", "canApprove"), markClaimAsPaid);
claimRouter.put('/:id/remove-attachment', removeClaimAttachment);
claimRouter.delete('/:id', deleteClaim);

export default claimRouter;

