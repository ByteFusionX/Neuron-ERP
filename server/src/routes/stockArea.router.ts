import { Router } from "express";
import { createStockArea, getStockAreas, updateStockArea, deleteStockArea } from "../controllers/stockArea.controller";

const stockAreaRouter = Router();

stockAreaRouter.get('/', getStockAreas);
stockAreaRouter.post('/', createStockArea);
stockAreaRouter.patch('/:id', updateStockArea);
stockAreaRouter.delete('/:id', deleteStockArea);

export default stockAreaRouter;
