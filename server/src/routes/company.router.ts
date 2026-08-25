import { Router } from "express";
import { getCompanyDetails, getCompanyTargets, setCompanyTarget, updateCompanyDetails, updateCompanyTarget } from "../controllers/company.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";

const companyRouter = Router ()

// The schema only defines a `companyTarget` flag, not one for general
// company profile details — getCompanyDetails is a widely-used lookup
// (e.g. header/branding) so it stays ungated. Target routes are gated.
const manageTarget = requirePrivilege("portalManagement", "companyTarget");

companyRouter.get('/getCompanyDetails',getCompanyDetails)
companyRouter.patch('/updateCompanyDetails',updateCompanyDetails)

companyRouter.get('/target', manageTarget, getCompanyTargets)
companyRouter.patch('/setTarget', manageTarget, setCompanyTarget)
companyRouter.patch('/update-target/:targetId', manageTarget, updateCompanyTarget)

export default companyRouter;