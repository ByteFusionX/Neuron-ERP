import { Router } from "express";
import { getJobSalesPerson, jobList, totalJob, updateJobStatus, deleteJob, jobSheets, oneJobSheet, updateAllocateType, getDropdownListForTechnical, getUnassignedProjectAndAMCJobs, transferProcurementPerson, getJobHistory, jobSheetsWithCompletedPO, jobSheetsWithApprovedPR } from "../controllers/job.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const jobRouter = Router()

jobRouter.use(requirePrivilege("jobSheet"));

jobRouter.post('/getJobs', jobList)
jobRouter.patch('/status/:jobId', updateJobStatus)
jobRouter.get('/total', totalJob)
jobRouter.get('/sales', getJobSalesPerson)
jobRouter.post('/delete', deleteJob)
jobRouter.get('/jobIds', jobSheets)
jobRouter.get('/jobIdsWithCompletedPO', jobSheetsWithCompletedPO)
jobRouter.get('/jobIdsWithApprovedPR', jobSheetsWithApprovedPR)
jobRouter.get('/jobIdDatas/:id', oneJobSheet)
jobRouter.post('/updateAllocateType', requirePrivilege("jobSheet", "allocateJobs"), updateAllocateType)
jobRouter.get('/technical', getDropdownListForTechnical)
jobRouter.post('/unassignedToTechnical', getUnassignedProjectAndAMCJobs)
jobRouter.post('/transferProcurementPerson', requirePrivilege("jobSheet", "transferProcurementPerson"), transferProcurementPerson)
jobRouter.get('/history/:jobId', getJobHistory)

export default jobRouter