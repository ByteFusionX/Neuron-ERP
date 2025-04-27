import { Router } from "express";
import { createSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

// supplierRouter.get('/', getSuppliers)
// supplierRouter.get('/supplierId', generateSupplierId)
// supplierRouter.get('/:supplierId', getSupplierById)
supplierRouter.post('/createSupplier', upload.fields([{ name: 'documents' }]), createSupplier)
// supplierRouter.patch('/:supplierId', updateSupplier)
supplierRouter.patch('/status/:id', updateSupplierStatus)
// supplierRouter.delete('/:supplierId', deleteSupplier)

export default supplierRouter