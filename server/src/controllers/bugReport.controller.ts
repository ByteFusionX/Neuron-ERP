import { Request, Response, NextFunction } from "express";
import { getPresignedUploadUrl, getFileUrlFromAws } from "../common/aws-connect";
import { getEmployeeData } from "../common/utils/util";
import BugReport from "../models/bugReport.model";
import Employee from "../models/employee.model";
import { analyzeBugReportWithClaude } from "../common/bugAnalysis";
import { notifyEmployee } from "../common/bugReportNotify";

const DEFAULT_REPORTING_TO_EMPLOYEE_ID = "NT-1101";

export const getBugReportUploadUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contentType } = req.body;

        if (!contentType || typeof contentType !== 'string') {
            return res.status(400).json({ message: 'contentType is required' });
        }

        const { uploadUrl, key } = await getPresignedUploadUrl('bug-reports', contentType);
        return res.status(200).json({ uploadUrl, key });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const createBugReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            description,
            screenshotKeys,
            consoleLog,
            networkErrors,
            actionTrail,
            stateSnapshot,
            route,
            userAgent,
            viewport,
            reportingTo,
        } = req.body;

        if (!description || typeof description !== 'string') {
            return res.status(400).json({ message: 'description is required' });
        }

        const employeeData = await getEmployeeData(req.user);
        if (!employeeData) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let reportingToId = reportingTo || null;
        if (!reportingToId) {
            const defaultAssignee = await Employee.findOne({ employeeId: DEFAULT_REPORTING_TO_EMPLOYEE_ID });
            reportingToId = defaultAssignee?._id || null;
        }

        const bugReport = new BugReport({
            reporterId: employeeData._id,
            reportingTo: reportingToId,
            description,
            route: route || '',
            userAgent: userAgent || '',
            viewport: viewport || '',
            screenshotKeys: screenshotKeys || [],
            consoleLog: consoleLog || [],
            networkErrors: networkErrors || [],
            actionTrail: actionTrail || [],
            stateSnapshot: stateSnapshot || {},
        });

        const saved = await bugReport.save();

        // Analysis needs a locally-authenticated Claude CLI session, which only exists on
        // machines where `claude login` has been run (this dev machine, or the Oracle worker).
        // Skip on hosts like Render that don't have it, instead of failing every report.
        if (process.env.ENABLE_AI_BUG_ANALYSIS === 'true') {
            analyzeBugReportWithClaude(saved._id.toString()).catch((error) => {
                console.log("Failed to kick off bug report AI analysis:", error);
            });
        }

        if (reportingToId) {
            void notifyEmployee(reportingToId.toString(), {
                type: 'BugReportAssigned',
                referenceModel: 'BugReport',
                title: 'New Bug Report Assigned',
                message: `${employeeData.firstName} ${employeeData.lastName} reported a bug: ${description.slice(0, 120)}`,
                sentBy: employeeData._id.toString(),
                referenceId: saved._id,
            });
        }

        return res.status(200).json(saved);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const getBugReports = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const reports = await BugReport.find()
            .populate('reporterId', 'firstName lastName email')
            .populate('reportingTo', 'firstName lastName email employeeId')
            .sort({ createdAt: -1 })
            .lean();

        const withScreenshotUrls = await Promise.all(
            reports.map(async (report) => {
                const screenshotUrls = await Promise.all(
                    (report.screenshotKeys || []).map(async (key: string) => {
                        const url = await getFileUrlFromAws(key, 300);
                        return url === 'error' ? null : url;
                    })
                );
                return { ...report, screenshotUrls: screenshotUrls.filter(Boolean) };
            })
        );

        return res.status(200).json(withScreenshotUrls);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const getBugReportById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const report = await BugReport.findById(id)
            .populate('reporterId', 'firstName lastName email')
            .populate('reportingTo', 'firstName lastName email employeeId')
            .lean();

        if (!report) {
            return res.status(404).json({ message: 'Bug report not found' });
        }

        return res.status(200).json(report);
    } catch (error) {
        console.log(error);
        next(error);
    }
};

const VALID_STATUSES = ['new', 'analyzing', 'implementing', 'fix-ready', 'approved', 'rejected', 'resolved', 'failed'];

export const updateBugReportStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const employeeData = await getEmployeeData(req.user);
        if (!employeeData) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const report = await BugReport.findByIdAndUpdate(id, { status }, { new: true });
        if (!report) {
            return res.status(404).json({ message: 'Bug report not found' });
        }

        if (status === 'resolved' && report.reporterId) {
            void notifyEmployee(report.reporterId.toString(), {
                type: 'BugReportResolved',
                referenceModel: 'BugReport',
                title: 'Your Bug Report Was Fixed',
                message: `Your bug report "${report.description.slice(0, 120)}" has been marked as resolved.`,
                sentBy: employeeData._id.toString(),
                referenceId: report._id,
            });
        }

        return res.status(200).json(report);
    } catch (error) {
        console.log(error);
        next(error);
    }
};
