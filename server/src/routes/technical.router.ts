import { Router } from "express";
import { getProjectAndAMCJobs, getEngineers, assignEngineer, getProjects, getProjectById, updateProject, getTasks, createTask, updateTask, getIssues, createIssue, updateIssue, deleteIssue, getActivityPlans, createActivityPlan, updateActivityPlan, deleteActivityPlan } from "../controllers/technical.controller";

const technicalRouter = Router()

technicalRouter.get('/getProjectAndAMCJobs', getProjectAndAMCJobs)
technicalRouter.get('/getEngineers', getEngineers)
technicalRouter.post('/assignEngineer', assignEngineer)
technicalRouter.post('/getProjects', getProjects)
technicalRouter.get('/:id', getProjectById)
technicalRouter.put('/:id', updateProject)

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

export default technicalRouter