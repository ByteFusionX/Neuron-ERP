import { Router } from "express";
import { createSupplier, deleteSupplier, getSupplierById, getSupplierList, getSuppliers, updateSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
import { getProjectAndAMCJobs } from "../controllers/project.controller";
const upload = require("../common/multer.storage")

const projectRouter = Router()

projectRouter.get('/getProjectAndAMCJobs', getProjectAndAMCJobs)
projectRouter.post('/', getSuppliers)
projectRouter.get('/:id', getSupplierById)
projectRouter.post('/create', upload.fields([{ name: 'documents' }]), createSupplier)


export default projectRouter