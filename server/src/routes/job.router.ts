import { Router } from "express";
import { getJobSalesPerson, jobList, totalJob, updateJobStatus, deleteJob, jobSheets, oneJobSheet, updateAllocateType, getDropdownListForTechnical, getUnassignedProjectAndAMCJobs, transferProcurementPerson, getJobHistory, jobSheetsWithCompletedPO, jobSheetsWithApprovedPR, getPreviousJobItemsByClient } from "../controllers/job.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const jobRouter = Router()

// Lightweight Job ID lookups are used as reference-data dropdowns by other
// modules (e.g. Inventory Stock Entries filters), so they're exempt from the
// jobSheet privilege gate below - they don't expose job sheet data itself.
jobRouter.get('/jobIds', jobSheets)
jobRouter.get('/jobIdsWithCompletedPO', jobSheetsWithCompletedPO)
jobRouter.get('/jobIdsWithApprovedPR', jobSheetsWithApprovedPR)
jobRouter.get('/previousJobItems/:clientId', getPreviousJobItemsByClient)

jobRouter.use(requirePrivilege("jobSheet"));

jobRouter.post('/getJobs', jobList)
jobRouter.patch('/status/:jobId', updateJobStatus)
jobRouter.get('/total', totalJob)
jobRouter.get('/sales', getJobSalesPerson)
jobRouter.post('/delete', deleteJob)
jobRouter.get('/jobIdDatas/:id', oneJobSheet)
jobRouter.post('/updateAllocateType', requirePrivilege("jobSheet", "allocateJobs"), updateAllocateType)
jobRouter.get('/technical', getDropdownListForTechnical)
jobRouter.post('/unassignedToTechnical', getUnassignedProjectAndAMCJobs)
jobRouter.post('/transferProcurementPerson', requirePrivilege("jobSheet", "transferProcurementPerson"), transferProcurementPerson)
jobRouter.get('/history/:jobId', getJobHistory)

export default jobRouter