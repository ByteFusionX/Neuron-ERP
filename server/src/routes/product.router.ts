import { Router } from "express";
import { createProduct, getProducts, getProductById, updateProduct, deleteProduct, getProductPartNumbers } from "../controllers/product.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const productRouter = Router()

productRouter.use(requirePrivilege("inventory.products"));

productRouter.get('/', getProducts)
productRouter.get('/part-numbers', getProductPartNumbers)
productRouter.get('/:id', getProductById)
productRouter.post('/', createProduct)
productRouter.patch('/:id', updateProduct)
productRouter.delete('/:id', deleteProduct)

export default productRouter;


