import { Router } from "express";
import { getBugReportUploadUrl, createBugReport, getBugReports, getBugReportById, updateBugReportStatus } from "../controllers/bugReport.controller";

const bugReportRouter = Router();

bugReportRouter.post('/upload-url', getBugReportUploadUrl);
bugReportRouter.get('/', getBugReports);
bugReportRouter.get('/:id', getBugReportById);
bugReportRouter.post('/', createBugReport);
bugReportRouter.patch('/:id/status', updateBugReportStatus);

export default bugReportRouter;
