import { Router } from "express";
import { blockSupplier, createSupplier, deleteSupplier, getSupplierById, getSupplierList, getSuppliers, previewSupplierCode, updateSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

supplierRouter.get('/suppliers-list', getSupplierList)
supplierRouter.post('/', getSuppliers)
supplierRouter.get('/preview-code', previewSupplierCode)
supplierRouter.get('/:id', getSupplierById)
supplierRouter.post('/create', upload.fields([{ name: 'documents' }]), createSupplier)
supplierRouter.patch('/update/:id', upload.fields([{ name: 'documents' }]), updateSupplier)
supplierRouter.patch('/status/:id', updateSupplierStatus)
supplierRouter.patch('/block/:id', blockSupplier)
supplierRouter.delete('/delete/:id', deleteSupplier)

export default supplierRouter