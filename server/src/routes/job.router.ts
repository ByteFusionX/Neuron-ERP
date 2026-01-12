import { Router } from "express";
import { getJobSalesPerson, jobList, totalJob, updateJobStatus, deleteJob, jobSheets, oneJobSheet, updateAllocateType, getDropdownListForTechnical, getUnassignedProjectAndAMCJobs, transferProcurementPerson } from "../controllers/job.controller";
const jobRouter = Router()

jobRouter.post('/getJobs', jobList)
jobRouter.patch('/status/:jobId', updateJobStatus)
jobRouter.get('/total', totalJob)
jobRouter.get('/sales', getJobSalesPerson)
jobRouter.post('/delete', deleteJob)
jobRouter.get('/jobIds', jobSheets)
jobRouter.get('/jobIdDatas/:id', oneJobSheet)
jobRouter.post('/updateAllocateType', updateAllocateType)
jobRouter.get('/technical', getDropdownListForTechnical)
jobRouter.post('/unassignedToTechnical', getUnassignedProjectAndAMCJobs)
jobRouter.post('/transferProcurementPerson', transferProcurementPerson)

export default jobRouter