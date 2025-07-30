import { Router } from "express";
import { getJobSalesPerson, jobList, totalJob, updateJobStatus, deleteJob, jobSheets, updateAllocateType, getDropdownListForTechnical, getUnassignedProjectAndAMCJobs } from "../controllers/job.controller";
const jobRouter = Router()

jobRouter.post('/getJobs', jobList)
jobRouter.patch('/status/:jobId', updateJobStatus)
jobRouter.get('/total', totalJob)
jobRouter.get('/sales', getJobSalesPerson)
jobRouter.post('/delete', deleteJob)
jobRouter.get('/noFilter', jobSheets)
jobRouter.post('/updateAllocateType', updateAllocateType)
jobRouter.get('/technical', getDropdownListForTechnical)
jobRouter.post('/unassignedToTechnical', getUnassignedProjectAndAMCJobs)

export default jobRouter