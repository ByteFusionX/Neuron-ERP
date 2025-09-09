import { Router } from "express";
import { getProjectAndAMCJobs, getEngineers, getUnassignedJobsByCustomer, assignEngineer, getProjects, getProjectById, updateProject, getTasks, createTask, updateTask, getIssues, createIssue, updateIssue, deleteIssue, getActivityPlans, createActivityPlan, updateActivityPlan, deleteActivityPlan, closeActivityPlan, getProjectUpdates, getProjectUpdateById, createProjectUpdate, updateProjectUpdate, deleteProjectUpdate, removeProjectUpdateAttachment, updateMaterialRequest, getBillingSummaries, getBillingSummaryById, createBillingSummary, updateBillingSummary, deleteBillingSummary, getCostingDetails, createProject } from "../controllers/technical.controller";
const upload = require("../common/multer.storage")

const technicalRouter = Router()

technicalRouter.get('/getProjectAndAMCJobs', getProjectAndAMCJobs)
technicalRouter.get('/getEngineers', getEngineers)
technicalRouter.get('/unassigned-jobs/:customerId', getUnassignedJobsByCustomer)
technicalRouter.post('/assignEngineer', assignEngineer)
technicalRouter.post('/getProjects', getProjects)
technicalRouter.post('/createProject', createProject)
technicalRouter.get('/:id', getProjectById)
technicalRouter.put('/:id', updateProject)
technicalRouter.get('/costing-details/:id', getCostingDetails)

technicalRouter.post('/material-request/:id', updateMaterialRequest)

technicalRouter.get('/tasks/:id', getTasks)
technicalRouter.post('/tasks/:id', createTask)
technicalRouter.put('/tasks/:id/:taskId', updateTask)

technicalRouter.post('/issues/:id', getIssues)
technicalRouter.post('/issues/:id', createIssue)
technicalRouter.put('/issues/:id/:issueId', updateIssue)
technicalRouter.delete('/issues/:id/:issueId', deleteIssue)

technicalRouter.get('/activity-plan/:id', getActivityPlans)
technicalRouter.post('/activity-plan/:id', createActivityPlan)
technicalRouter.put('/activity-plan/:id/:activityPlanId', updateActivityPlan)
technicalRouter.delete('/activity-plan/:id/:activityPlanId', deleteActivityPlan)
technicalRouter.put('/activity-plan/:id/:activityPlanId/close', closeActivityPlan)

technicalRouter.post('/project-updates/get/:id', getProjectUpdates)
technicalRouter.get('/project-updates/:id/:updateId', getProjectUpdateById)
technicalRouter.post('/project-updates/:id', upload.fields([{ name: 'attachments' }]), createProjectUpdate)
technicalRouter.put('/project-updates/:id/:updateId', upload.fields([{ name: 'attachments' }]), updateProjectUpdate)
technicalRouter.delete('/project-updates/:id/:updateId', deleteProjectUpdate)
technicalRouter.patch('/project-updates/:id/:updateId/remove-attachment', removeProjectUpdateAttachment)

technicalRouter.get('/billing-summary/:id', getBillingSummaries)
technicalRouter.get('/billing-summary/:id/:billingSummaryId', getBillingSummaryById)
technicalRouter.post('/billing-summary/:id', createBillingSummary)
technicalRouter.put('/billing-summary/:id/:billingSummaryId', updateBillingSummary)
technicalRouter.delete('/billing-summary/:id/:billingSummaryId', deleteBillingSummary)

export default technicalRouter