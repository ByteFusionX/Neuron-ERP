import { Router } from "express";
import { getDashboardMetrics, getEnquirySalesConversion, getGrossProfitForLastSevenMonths, getPresaleJobSalesConversion, getReAssignedPresaleJobSalesConversion, getRevenuePerSalesperson } from "../controllers/dashboard.controller";
import { requirePrivilege } from "../common/middlewares/privilege.middleware";
import { getSalesDashboard } from "../controllers/salesDashboard.controller";
import { getDashboardPreferences, resetDashboardPreferences, updateDashboardPreferences } from "../controllers/dashboardPreference.controller";

const dashboardRouter = Router()

// Scoped inside the controller by the viewer's quotation/enquiry report access, so it sits before the legacy dashboard gate.
dashboardRouter.post('/sales', getSalesDashboard)

// Per-employee layout and opening view; cosmetic only, so no privilege beyond being signed in.
dashboardRouter.get('/preferences/:dashboard', getDashboardPreferences)
dashboardRouter.put('/preferences/:dashboard', updateDashboardPreferences)
dashboardRouter.delete('/preferences/:dashboard', resetDashboardPreferences)

dashboardRouter.use(requirePrivilege("dashboard"));

dashboardRouter.post('/metrics', getDashboardMetrics)
dashboardRouter.post('/revenueperperson', getRevenuePerSalesperson)
dashboardRouter.post('/grossProfitForLastSevenMonths', getGrossProfitForLastSevenMonths)
dashboardRouter.post('/enquirySalesConversion', getEnquirySalesConversion)
dashboardRouter.post('/presaleSalesConversion', getPresaleJobSalesConversion)
dashboardRouter.post('/rePresaleSalesConversion', getReAssignedPresaleJobSalesConversion)

export default dashboardRouter;