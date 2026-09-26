import { Router } from "express";
import { getCompanyDetails, getCompanyTargets, setCompanyTarget, updateCompanyDetails, updateCompanyTarget, uploadCompanyLogo } from "../controllers/company.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
const upload = require("../common/multer.storage")

const companyRouter = Router ()

// getCompanyDetails is a widely-used lookup (header/branding) so reading stays
// ungated. Editing the profile and all target routes are gated.
const editProfile = requirePrivilege("portalManagement", "companyProfileEdit");
const manageTarget = requirePrivilege("portalManagement", "companyTarget");

companyRouter.get('/getCompanyDetails',getCompanyDetails)
companyRouter.patch('/updateCompanyDetails', editProfile, updateCompanyDetails)
companyRouter.patch('/logo', editProfile, upload.single('logo'), uploadCompanyLogo)

companyRouter.get('/target', manageTarget, getCompanyTargets)
companyRouter.patch('/setTarget', manageTarget, setCompanyTarget)
companyRouter.patch('/update-target/:targetId', manageTarget, updateCompanyTarget)

export default companyRouter;