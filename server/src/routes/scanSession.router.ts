import { Router } from "express";
import { createScanSession, getScanSession, appendScan, closeScanSession } from "../controllers/scanSession.controller";

const scanSessionRouter = Router();

scanSessionRouter.post('/', createScanSession);
scanSessionRouter.get('/:sessionId', getScanSession);
scanSessionRouter.post('/:sessionId/scan', appendScan);
scanSessionRouter.post('/:sessionId/close', closeScanSession);

export default scanSessionRouter;
