import { Router } from "express";
import { getApprovalRules, saveApprovalRule } from "../controllers/approvalRule.controller";

const approvalRuleRouter = Router()

approvalRuleRouter.get('/', getApprovalRules)
approvalRuleRouter.put('/:type', saveApprovalRule)

export default approvalRuleRouter
