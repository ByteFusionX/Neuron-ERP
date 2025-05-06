import { Router } from "express";
import { getCompanyDetails, getCompanyTargets, setCompanyTarget, updateCompanyDetails, updateCompanyTarget } from "../controllers/company.controller";

const companyRouter = Router ()

companyRouter.get('/getCompanyDetails',getCompanyDetails)
companyRouter.patch('/updateCompanyDetails',updateCompanyDetails)

companyRouter.get('/target',getCompanyTargets)
companyRouter.patch('/setTarget',setCompanyTarget)
companyRouter.patch('/update-target/:targetId',updateCompanyTarget)

export default companyRouter;