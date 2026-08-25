import { Router } from "express";
import { blockSupplier, createSupplier, deleteSupplier, getSupplierById, getSupplierList, getSuppliers, previewSupplierId, updateSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

supplierRouter.use(requirePrivilege("supplier"));

supplierRouter.get('/suppliers-list', getSupplierList)
supplierRouter.post('/', getSuppliers)
supplierRouter.get('/preview-code', previewSupplierId)
supplierRouter.get('/:id', getSupplierById)
supplierRouter.post('/create', upload.fields([{ name: 'documents' }]), createSupplier)
supplierRouter.patch('/update/:id', upload.fields([{ name: 'documents' }]), updateSupplier)
supplierRouter.patch('/status/:id', requirePrivilege("supplier", "canApproveSupplier"), updateSupplierStatus)
supplierRouter.patch('/block/:id', blockSupplier)
supplierRouter.delete('/delete/:id', deleteSupplier)

export default supplierRouter