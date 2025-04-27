import { Router } from "express";
import { createSupplier, deleteSupplier, getSupplierById, updateSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

// supplierRouter.get('/', getSuppliers)
supplierRouter.get('/:id', getSupplierById)
supplierRouter.post('/create', upload.fields([{ name: 'documents' }]), createSupplier)
supplierRouter.patch('/update/:id',upload.fields([{ name: 'documents' }]), updateSupplier)
supplierRouter.patch('/status/:id', updateSupplierStatus)
supplierRouter.delete('/delete/:id', deleteSupplier)

export default supplierRouter