import { Router } from "express";
import { createProduct, getProducts, getProductById, updateProduct, deleteProduct, getProductPartNumbers, generateItemCode, approveProduct, rejectProduct } from "../controllers/product.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const productRouter = Router()

productRouter.use(requirePrivilege("inventory.products"));

productRouter.get('/', getProducts)
productRouter.get('/part-numbers', getProductPartNumbers)
productRouter.get('/generate-item-code', generateItemCode)
productRouter.get('/:id', getProductById)
productRouter.post('/', createProduct)
productRouter.patch('/:id', updateProduct)
// `approve` is not an assignable flag yet, so only admin / superAdmin pass.
productRouter.post('/:id/approve', requirePrivilege("inventory.products", "approve"), approveProduct)
productRouter.post('/:id/reject', requirePrivilege("inventory.products", "approve"), rejectProduct)
productRouter.delete('/:id', deleteProduct)

export default productRouter;


