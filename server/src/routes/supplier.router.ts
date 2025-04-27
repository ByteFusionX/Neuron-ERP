import { Router } from "express";
import { createSupplier } from "../controllers/supplier.controller";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

// supplierRouter.get('/', getSuppliers)
// supplierRouter.get('/supplierId', generateSupplierId)
// supplierRouter.get('/:supplierId', getSupplierById)
supplierRouter.post('/createSupplier', upload.array('files'), createSupplier)
// supplierRouter.patch('/:supplierId', updateSupplier)
// supplierRouter.patch('/status/:supplierId', updateSupplierStatus)
// supplierRouter.delete('/:supplierId', deleteSupplier)

export default supplierRouter