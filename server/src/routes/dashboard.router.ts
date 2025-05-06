import { Router } from "express";
import { getDashboardMetrics, getEnquirySalesConversion, getGrossProfitForLastSevenMonths, getPresaleJobSalesConversion, getReAssignedPresaleJobSalesConversion, getRevenuePerSalesperson } from "../controllers/dashboard.controller";

const dashboardRouter = Router()

dashboardRouter.post('/metrics', getDashboardMetrics)
dashboardRouter.post('/revenueperperson', getRevenuePerSalesperson)
dashboardRouter.post('/grossProfitForLastSevenMonths', getGrossProfitForLastSevenMonths)
dashboardRouter.post('/enquirySalesConversion', getEnquirySalesConversion)
dashboardRouter.post('/presaleSalesConversion', getPresaleJobSalesConversion)
dashboardRouter.post('/rePresaleSalesConversion', getReAssignedPresaleJobSalesConversion)

export default dashboardRouter;