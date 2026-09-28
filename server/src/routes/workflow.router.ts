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
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const workflowRouter = Router()

workflowRouter.post('/', requirePrivilege("portalManagement", "approvalRulesEdit"), createWorkflow)
workflowRouter.get('/', requirePrivilege("portalManagement", "approvalRules"), getWorkflows)
workflowRouter.post('/delegations', requirePrivilege("portalManagement", "approvalRulesEdit"), createWorkflowDelegation)
workflowRouter.get('/delegations', requirePrivilege("portalManagement", "approvalRules"), getWorkflowDelegations)
workflowRouter.put('/delegations/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), updateWorkflowDelegation)
workflowRouter.put('/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), updateWorkflow)
workflowRouter.delete('/:id', requirePrivilege("portalManagement", "approvalRulesEdit"), deleteWorkflow)

export default workflowRouter
