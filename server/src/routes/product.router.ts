import { Router } from "express";
import { createProduct, getProducts, getProductById, updateProduct, deleteProduct, getProductPartNumbers } from "../controllers/product.controller";
const productRouter = Router()

productRouter.get('/', getProducts)
productRouter.get('/part-numbers', getProductPartNumbers)
productRouter.get('/:id', getProductById)
productRouter.post('/', createProduct)
productRouter.patch('/:id', updateProduct)
productRouter.delete('/:id', deleteProduct)

export default productRouter;


