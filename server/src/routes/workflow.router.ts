import { Router } from "express";
import { 
    createWorkflow, 
    getWorkflows, 
    updateWorkflow, 
    deleteWorkflow, 
} from "../controllers/workflow.controller";

const workflowRouter = Router()

workflowRouter.post('/', createWorkflow)
workflowRouter.get('/', getWorkflows)
workflowRouter.put('/:id', updateWorkflow)
workflowRouter.delete('/:id', deleteWorkflow)

export default workflowRouter