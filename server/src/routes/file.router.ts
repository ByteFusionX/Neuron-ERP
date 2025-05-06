import { Router } from "express";
import { DownloadFile, clearAllPresaleFiles, deleteFile, fetchFile } from "../controllers/file.controller";
const fileRouter = Router()

fileRouter.get('/download', DownloadFile)
fileRouter.get('/:filename', fetchFile)
fileRouter.delete('/', deleteFile)
fileRouter.delete('/clearAll', clearAllPresaleFiles)

export default fileRouter