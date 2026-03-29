import { Router } from "express";
import { createWarehouse, getWarehouses, getWarehouseById, updateWarehouse, deleteWarehouse } from "../controllers/warehouse.controller";
const warehouseRouter = Router()

warehouseRouter.get('/', getWarehouses)
warehouseRouter.get('/:id', getWarehouseById)
warehouseRouter.post('/', createWarehouse)
warehouseRouter.patch('/:id', updateWarehouse)
warehouseRouter.delete('/:id', deleteWarehouse)

export default warehouseRouter;


