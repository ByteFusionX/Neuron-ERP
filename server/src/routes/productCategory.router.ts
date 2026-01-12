import { Router } from "express";
import { createProductCategory, getProductCategories, getProductCategoryById, updateProductCategory, deleteProductCategory } from "../controllers/productCategory.controller";
const productCategoryRouter = Router()

productCategoryRouter.get('/', getProductCategories)
productCategoryRouter.get('/:id', getProductCategoryById)
productCategoryRouter.post('/', createProductCategory)
productCategoryRouter.patch('/:id', updateProductCategory)
productCategoryRouter.delete('/:id', deleteProductCategory)

export default productCategoryRouter;


