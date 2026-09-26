import { Router } from "express";
import { getApprovalRules, saveApprovalRule } from "../controllers/approvalRule.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const approvalRuleRouter = Router()

approvalRuleRouter.get('/', requirePrivilege("portalManagement", "approvalRules"), getApprovalRules)
approvalRuleRouter.put('/:type', requirePrivilege("portalManagement", "approvalRulesEdit"), saveApprovalRule)

export default approvalRuleRouter
