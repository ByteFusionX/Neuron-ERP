import { Router } from "express";
import { getSystemSetting, saveSystemSetting } from "../controllers/systemSetting.controller";

const systemSettingRouter = Router()

systemSettingRouter.get('/:key', getSystemSetting)
systemSettingRouter.put('/:key', saveSystemSetting)

export default systemSettingRouter
