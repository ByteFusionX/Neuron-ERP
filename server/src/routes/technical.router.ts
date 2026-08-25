import { Router } from "express";
import { getProjectAndAMCJobs, getEngineers, getUnassignedJobsByCustomer, assignEngineer, getProjects, getProjectById, updateProject, getTasks, createTask, updateTask, getIssues, createIssue, updateIssue, deleteIssue, getActivityPlans, createActivityPlan, updateActivityPlan, deleteActivityPlan, closeActivityPlan, getProjectUpdates, getProjectUpdateById, createProjectUpdate, updateProjectUpdate, deleteProjectUpdate, removeProjectUpdateAttachment, updateMaterialRequest, getBillingSummaries, getBillingSummaryById, createBillingSummary, updateBillingSummary, deleteBillingSummary, getCostingDetails, getMrRequests, createProject, getMaterialRequestByJobId, transferEngineer, getPendingMaterialRequestProjects, approveMaterialRequest, rejectMaterialRequest, approveMaterialRequestItem, rejectMaterialRequestItem, approveMaterialRequestFile, rejectMaterialRequestFile, approveAllPendingMaterialRequests } from "../controllers/technical.controller";
const upload = require("../common/multer.storage")
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const technicalRouter = Router()

technicalRouter.use(requirePrivilege("technical"));

technicalRouter.get('/getProjectAndAMCJobs', getProjectAndAMCJobs)
technicalRouter.get('/getEngineers', getEngineers)
technicalRouter.get('/unassigned-jobs/:customerId', requirePrivilege("technical", "canViewOpenToWorkAndAssign"), getUnassignedJobsByCustomer)
technicalRouter.post('/assignEngineer', requirePrivilege("technical", "canViewOpenToWorkAndAssign"), assignEngineer)
technicalRouter.post('/transferEngineer', requirePrivilege("technical", "canTransferToEngineer"), transferEngineer)
technicalRouter.post('/getProjects', getProjects)
technicalRouter.post('/createProject', createProject)
technicalRouter.post('/getMrRequests', getMrRequests)
technicalRouter.get('/:id', getProjectById)
technicalRouter.put('/:id', updateProject)
technicalRouter.get('/costing-details/:id', getCostingDetails)
technicalRouter.get('/material-request/:jobId', getMaterialRequestByJobId)

technicalRouter.post('/material-request/:id', upload.fields([{ name: 'attachments' }]), updateMaterialRequest)

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

technicalRouter.post('/material-requests/pending', getPendingMaterialRequestProjects)
technicalRouter.post('/material-requests/:id/approve', requirePrivilege("technical", "canApproveMRRequests"), approveMaterialRequest)
technicalRouter.post('/material-requests/:id/reject', requirePrivilege("technical", "canApproveMRRequests"), rejectMaterialRequest)
technicalRouter.post('/material-requests/:id/approve-all-pending', requirePrivilege("technical", "canApproveMRRequests"), approveAllPendingMaterialRequests)
technicalRouter.post('/material-requests/:id/item/:itemIndex/approve', requirePrivilege("technical", "canApproveMRRequests"), approveMaterialRequestItem)
technicalRouter.post('/material-requests/:id/item/:itemIndex/reject', requirePrivilege("technical", "canApproveMRRequests"), rejectMaterialRequestItem)
technicalRouter.post('/material-requests/:id/file/:fileIndex/approve', requirePrivilege("technical", "canApproveMRRequests"), approveMaterialRequestFile)
technicalRouter.post('/material-requests/:id/file/:fileIndex/reject', requirePrivilege("technical", "canApproveMRRequests"), rejectMaterialRequestFile)

export default technicalRouter