import { Router } from "express";
import { blockSupplier, checkSupplierDuplicate, createSupplier, getSupplierDuplicatesReport, deleteSupplier, getSupplierById, getSupplierList, getSupplierReportSummary, getSuppliers, previewSupplierId, updateSupplier, updateSupplierStatus } from "../controllers/supplier.controller";
import { requireAnyPrivilege, requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")

const supplierRouter = Router()

// Supplier picker used by item entry (presale estimation, quotation, deal sheet).
supplierRouter.get('/suppliers-list', requireAnyPrivilege("supplier", "assignedJob", "quotation", "dealSheet", "purchase"), getSupplierList)

supplierRouter.use(requirePrivilege("supplier"));

supplierRouter.post('/', getSuppliers)
supplierRouter.post('/report-summary', getSupplierReportSummary)
supplierRouter.get('/preview-code', previewSupplierId)
supplierRouter.get('/check-duplicate', checkSupplierDuplicate)
supplierRouter.get('/duplicates-report', getSupplierDuplicatesReport)
supplierRouter.get('/:id', getSupplierById)
supplierRouter.post('/create', upload.fields([{ name: 'documents' }]), createSupplier)
supplierRouter.patch('/update/:id', upload.fields([{ name: 'documents' }]), updateSupplier)
supplierRouter.patch('/status/:id', requirePrivilege("supplier", "canApproveSupplier"), updateSupplierStatus)
supplierRouter.patch('/block/:id', blockSupplier)
supplierRouter.delete('/delete/:id', deleteSupplier)

export default supplierRouter