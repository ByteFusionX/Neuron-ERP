import { Router } from "express";
import { getProjectAndAMCJobs, getEngineers, assignEngineer, getProjects, getProjectById, updateProject, getTasks, createTask, updateTask } from "../controllers/technical.controller";

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

export default technicalRouter