import { Router } from "express";
import { getSystemSetting, saveSystemSetting } from "../controllers/systemSetting.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

// Each system-setting key maps to its own Settings flag.
const SETTING_FLAGS: Record<string, string> = { notifications: "notificationsEdit", audit: "auditEdit" };
const requireSettingPrivilege = (req: any, res: any, next: any) =>
    requirePrivilege("portalManagement", SETTING_FLAGS[req.params.key] ?? "__none__")(req, res, next);

const systemSettingRouter = Router()

systemSettingRouter.get('/:key', getSystemSetting)
systemSettingRouter.put('/:key', requireSettingPrivilege, saveSystemSetting)

export default systemSettingRouter
