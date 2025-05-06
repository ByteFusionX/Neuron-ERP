import { Router } from "express";
import { createCategory, getCategory, updateCategory, deleteCategory } from "../controllers/category.controller";
const catRouter = Router()

catRouter.get('/', getCategory)
catRouter.post('/', createCategory)
catRouter.patch('/:categoryId', updateCategory)
catRouter.post('/delete', deleteCategory)

export default catRouter;