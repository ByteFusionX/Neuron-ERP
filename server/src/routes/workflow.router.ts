import { Router } from "express";
import { 
    createWorkflow, 
    getWorkflows, 
    updateWorkflow, 
    deleteWorkflow, 
    createWorkflowDelegation,
    getWorkflowDelegations,
    updateWorkflowDelegation,
} from "../controllers/workflow.controller";
import { requireAnyPrivilege, requirePrivilege } from "../common/middlewares/privilege.middleware";

const workflowRouter = Router()

workflowRouter.post('/', requirePrivilege("portalManagement", "approvalRulesEdit"), createWorkflow)
// A single feature's workflow is read-only context (e.g. the presale step tracker), so anyone who can
// open that feature's module may read it; the full list stays behind approvalRules.
const canReadFeatureWorkflow = requireAnyPrivilege("assignedJob", "enquiry", "quotation", "dealSheet", "purchase");
const approvalRulesView = requirePrivilege("portalManagement", "approvalRules");
workflowRouter.get('/', (req, res, next) => (req.query.feature ? canReadFeatureWorkflow : approvalRulesView)(req, res, next), getWorkflows)
workflowRouter.post('/delegations', requirePrivilege("portalManagement", "approvalRulesEdit"), createWorkflowDelegation)
workflowRouter.get('/delegations', requirePrivilege("portalManagement", "approvalRules"), getWorkflowDelegations)
workflowRouter.put('/delegations/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), updateWorkflowDelegation)
workflowRouter.put('/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), updateWorkflow)
workflowRouter.delete('/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), deleteWorkflow)

export default workflowRouter
