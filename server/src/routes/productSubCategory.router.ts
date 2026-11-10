import { Router } from "express";
import { createProductSubCategory, getProductSubCategories, updateProductSubCategory, deleteProductSubCategory } from "../controllers/productSubCategory.controller";
const productSubCategoryRouter = Router()

productSubCategoryRouter.get('/', getProductSubCategories)
productSubCategoryRouter.post('/', createProductSubCategory)
productSubCategoryRouter.patch('/:id', updateProductSubCategory)
productSubCategoryRouter.delete('/:id', deleteProductSubCategory)

export default productSubCategoryRouter;
