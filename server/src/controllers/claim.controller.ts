import { Request, Response, NextFunction } from "express";
import Claim from '../models/claim.model';
import Job from '../models/job.model';
import Workflow from '../models/workflow.model';
import { ObjectId } from "mongodb";
import { getEmployeeData, getDateRangeByDay, buildPrivilegeAccessFilter } from "../common/utils/util";
import { uploadFileToAws } from "../common/aws-connect";
import { getWorkflowSteps, updateApprovalStatus } from "../services/workflow.service";
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import Employee from '../models/employee.model';

const notifyNextClaimApprovers = async (claim: any, app: any, sentBy: string) => {
    try {
        const pendingStatuses = claim.approvalStatus
            .filter((a: any) => a.status === 'pending')
            .sort((a: any, b: any) => a.step - b.step);

        const nextApproval = pendingStatuses[0];
        if (!nextApproval) return;

        const nextApproverIds = new Set<string>();

        if (nextApproval.managerApproval) {
            const requesterId = (claim.raisedBy as any)?._id || claim.raisedBy;
            const requester = await Employee.findById(requesterId)
                .populate('reportingTo')
                .lean();
            const manager: any = (requester as any)?.reportingTo;
            if (manager?._id) {
                nextApproverIds.add(manager._id.toString());
            }
        } else if (nextApproval.role) {
            const nextRoleId = nextApproval.role?._id?.toString() || nextApproval.role?.toString();
            if (nextRoleId) {
                const approverEmployees = await Employee.find({
                    category: nextRoleId,
                    isDeleted: { $ne: true },
                    isBlocked: { $ne: true }
                }).lean();
                for (const approver of approverEmployees) {
                    nextApproverIds.add(approver._id.toString());
                }
            }
        }

        if (nextApproverIds.size > 0) {
            const socket = app.get('io') as Server;
            const additionalData = { claimId: claim._id.toString(), technicalId: claim.technicalId?.toString() };

            let raiserName = 'Someone';
            if (claim.raisedBy && typeof claim.raisedBy === 'object' && claim.raisedBy.firstName) {
                raiserName = `${claim.raisedBy.firstName} ${claim.raisedBy.lastName || ''}`.trim();
            }

            await createNotificationWithPrivileges(
                {
                    type: 'ClaimApprovalRequest',
                    referenceModel: 'Claim',
                    title: 'Claim awaiting your approval',
                    message: `A claim is raised by ${raiserName} of ${claim.amount} QAR for ${claim.reason}.`,
                    sentBy: sentBy,
                    referenceId: claim._id,
                    additionalData,
                },
                {
                    privilegeKey: 'claims',
                    checkFunction: (privileges: any, employeeId?: string) => {
                        if (!employeeId || !nextApproverIds.has(employeeId)) return false;
                        if (nextApproval.managerApproval) return true;
                        return privileges.claims?.canApprove === true;
                    }
                },
                socket
            );
        }
    } catch (err) {
        console.error('Error notifying next approvers:', err);
    }
};

export const createClaim = async (req: any, res: Response, next: NextFunction) => {
    try {
        let { reason, amount, type, technicalId, jobId, category } = req.body;
        const userToken = req.user;

        if (!reason || !amount || !type) {
            return res.status(400).json({
                success: false,
                message: "Reason, amount, and type are required"
            });
        }

        if (!['normal', 'project'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim type. Must be 'normal' or 'project'"
            });
        }

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        let attachmentFiles = [];
        if (req.files?.attachments) {
            attachmentFiles = await Promise.all(req.files.attachments.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        const workflowFeature = type === 'project' ? 'projectClaim' : 'claim';
        const approvalStatus = await getWorkflowSteps(workflowFeature, employee._id.toString());
        category = category ? category : 'others';

        const claimData: any = {
            reason,
            amount,
            raisedBy: employee._id,
            raisedDate: new Date(),
            attachements: attachmentFiles,
            type,
            approvalStatus,
            category
        };

        if (jobId) claimData.jobId = jobId;
        if (technicalId && ObjectId.isValid(technicalId)) claimData.technicalId = technicalId;

        const claim = await Claim.create(claimData);

        await notifyNextClaimApprovers(claim, req.app, employee._id?.toString());

        const populatedClaim = await Claim.findById(claim._id)
            .populate('raisedBy')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy')

        return res.status(201).json({
            success: true,
            message: "Claim created successfully",
            data: populatedClaim
        });

    } catch (error) {
        console.error('Error creating claim:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to create claim",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getClaims = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { reason, raisedDate, fromDate, toDate, raisedBy, status, page = 1, row = 10, technicalId } = req.query;

        const tokenData = (req as any).user;
        const employee = await getEmployeeData(tokenData);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found",
            });
        }

        const privileges = employee.category?.privileges;
        const accessFilter = privileges?.claims?.viewReport
            ? await buildPrivilegeAccessFilter(employee._id, privileges.claims.viewReport, 'raisedBy')
            : {};

        const pageNum = parseInt(page as string);
        const rowNum = parseInt(row as string);
        const skip = (pageNum - 1) * rowNum;

        const matchConditions: any = {
            ...accessFilter
        };

        if (reason) {
            matchConditions.reason = { $regex: reason, $options: 'i' };
        }

        if (raisedDate && !fromDate && !toDate) {
            const { startOfDay, endOfDay } = getDateRangeByDay(raisedDate as string);
            matchConditions.raisedDate = { $gte: startOfDay, $lte: endOfDay };
        }

        if (fromDate && !toDate) {
            const { startOfDay, endOfDay } = getDateRangeByDay(fromDate as string);
            matchConditions.raisedDate = { $gte: startOfDay, $lte: endOfDay };
        }

        if (fromDate && toDate) {
            const fromDateObj = new Date(fromDate as string);
            const toDateObj = new Date(toDate as string);
            if (fromDateObj.toDateString() === toDateObj.toDateString()) {
                const { startOfDay, endOfDay } = getDateRangeByDay(fromDate as string);
                matchConditions.raisedDate = { $gte: startOfDay, $lte: endOfDay };
            } else {
                const { startOfDay, endOfDay } = getDateRangeByDay(fromDate as string, toDate as string);
                matchConditions.raisedDate = { $gte: startOfDay, $lte: endOfDay };
            }
        }

        if (technicalId) {
            matchConditions.technicalId = new ObjectId(technicalId as string);
        } else {
            matchConditions.technicalId = { $exists: false };
        }

        let aggregationPipeline: any[] = [
            { $match: matchConditions },
            {
                $lookup: {
                    from: "employees",
                    localField: "raisedBy",
                    foreignField: "_id",
                    as: "raisedBy"
                }
            },
            {
                $unwind: {
                    path: "$raisedBy",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "raisedBy.reportingTo",
                    foreignField: "_id",
                    as: "raisedBy.reportingTo"
                }
            },
            {
                $unwind: {
                    path: "$raisedBy.reportingTo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    let: { approvalRoles: "$approvalStatus.role" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$approvalRoles"] }
                            }
                        }
                    ],
                    as: "approvalRoles"
                }
            },
            {
                $lookup: {
                    from: "employees",
                    let: { approvalEmployees: "$approvalStatus.updatedBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$_id", "$$approvalEmployees"] }
                            }
                        }
                    ],
                    as: "approvalEmployees"
                }
            },
            {
                $lookup: {
                    from: "jobs",
                    localField: "jobId",
                    foreignField: "jobId",
                    as: "job"
                }
            },
            {
                $unwind: {
                    path: "$job",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    approvalStatus: {
                        $map: {
                            input: "$approvalStatus",
                            as: "approval",
                            in: {
                                $mergeObjects: [
                                    "$$approval",
                                    {
                                        role: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$approvalRoles",
                                                        cond: { $eq: ["$$this._id", "$$approval.role"] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        updatedBy: {
                                            $cond: {
                                                if: { $ne: ["$$approval.updatedBy", null] },
                                                then: {
                                                    $arrayElemAt: [
                                                        {
                                                            $filter: {
                                                                input: "$approvalEmployees",
                                                                cond: { $eq: ["$$this._id", "$$approval.updatedBy"] }
                                                            }
                                                        },
                                                        0
                                                    ]
                                                },
                                                else: null
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    overallStatus: {
                        $let: {
                            vars: {
                                lastApproval: { $arrayElemAt: ["$approvalStatus", -1] }
                            },
                            in: "$$lastApproval.status"
                        }
                    }
                }
            }
        ];

        if (status) {
            aggregationPipeline.push({
                $match: { overallStatus: status }
            });
        }

        if (raisedBy) {
            aggregationPipeline.push({
                $match: { "raisedBy.firstName": { $regex: raisedBy, $options: 'i' } }
            });
        }

        aggregationPipeline.push(
            { $skip: skip },
            { $limit: rowNum }
        );

        const claims = await Claim.aggregate(aggregationPipeline);

        const totalPipeline = [...aggregationPipeline.slice(0, -2)];
        totalPipeline.push({ $count: "total" });
        const totalResult = await Claim.aggregate(totalPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        if (claims.length > 0) {
            return res.status(200).json({
                success: true,
                data: claims,
                total
            });
        }

        return res.status(204).json({
            success: true,
            message: "No claims found"
        });

    } catch (error) {
        console.error('Error fetching claims:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch claims",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getClaimById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID"
            });
        }

        const claim = await Claim.findById(id)
            .populate('raisedBy')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy');

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Claim not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: claim
        });

    } catch (error) {
        console.error('Error fetching claim:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch claim",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateClaimAndSubmit = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        let { reason, amount, filesToRemove, category } = req.body;
        const userToken = req.user;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID"
            });
        }

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        const claim = await Claim.findById(id);
        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Claim not found"
            });
        }

        if (claim.raisedBy.toString() !== employee._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only update your own claims"
            });
        }

        let newAttachmentFiles = [];
        if (req.files?.newAttachments) {
            newAttachmentFiles = await Promise.all(req.files.newAttachments.map(async (file: any) => {
                await uploadFileToAws(file.filename, file.path);
                return { fileName: file.filename, originalname: file.originalname };
            }));
        }

        const updateData: any = {};
        if (reason) updateData.reason = reason;
        if (amount) updateData.amount = amount;
        if (category) updateData.category = category;
        let updatedAttachments = [...claim.attachements];


        filesToRemove = JSON.parse(filesToRemove);
        filesToRemove = filesToRemove.map((file: any) => file.fileName);

        if (filesToRemove && Array.isArray(filesToRemove) && filesToRemove.length > 0) {
            updatedAttachments = updatedAttachments.filter((att: any) => !filesToRemove.includes(att.fileName));
        }

        if (newAttachmentFiles.length > 0) {
            updatedAttachments = [...updatedAttachments, ...newAttachmentFiles];
        }

        if (filesToRemove?.length > 0 || newAttachmentFiles.length > 0) {
            updateData.attachements = updatedAttachments;
        }

        const rejectedIndex = claim.approvalStatus.findIndex(status => status.status === 'rejected');
        if (rejectedIndex !== -1) {

            const workflowFeature = claim.type === 'project' ? 'projectClaim' : 'claim';
            const newApprovalStatus = await getWorkflowSteps(workflowFeature, claim.raisedBy.toString());

            updateData.approvalStatus = [...claim.approvalStatus, ...newApprovalStatus];
        }

        const updatedClaim = await Claim.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('raisedBy')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy');

        if (rejectedIndex !== -1) {
            await notifyNextClaimApprovers(updatedClaim, req.app, employee._id?.toString());
        }

        return res.status(200).json({
            success: true,
            message: "Claim updated and submitted successfully",
            data: updatedClaim
        });

    } catch (error) {
        console.error('Error updating claim:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update claim",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateClaimStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { status, comment } = req.body;
        const userToken = req.user;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID"
            });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be 'approved' or 'rejected'"
            });
        }

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        if (status === 'approved' || status === 'rejected') {
            const privileges = employee.category?.privileges;
            if (!privileges?.claims?.canApprove) {
                return res.status(403).json({
                    success: false,
                    message: "You do not have permission to approve claims",
                });
            }
        }

        const claim = await Claim.findById(id).populate('approvalStatus.role').populate('raisedBy');
        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Claim not found"
            });
        }

        const updatedApprovalStatus = await updateApprovalStatus(status, claim.approvalStatus, comment, employee);
        claim.approvalStatus = updatedApprovalStatus;

        await claim.save();

        const socket = req.app.get('io') as Server;
        const additionalData = { claimId: claim._id.toString(), technicalId: claim.technicalId?.toString() };
        const raiserId = (claim.raisedBy as any)?._id?.toString() || claim.raisedBy?.toString();
        const raiserFilter = {
            privilegeKey: 'claims' as const,
            checkFunction: (p: any, employeeId?: string) => employeeId === raiserId && p.claims?.viewReport !== 'none'
        };

        if (status === 'rejected') {
            await createNotificationWithPrivileges(
                {
                    type: 'ClaimRejected',
                    referenceModel: 'Claim',
                    title: 'Claim rejected',
                    message: `Your claim of ${claim.amount} QAR for ${claim.reason} has been rejected.`,
                    sentBy: employee._id?.toString(),
                    referenceId: claim._id,
                    additionalData
                },
                raiserFilter,
                socket
            );
        } else if (status === 'approved') {
            const hasPending = claim.approvalStatus.some((s: any) => s.status === 'pending');
            if (hasPending) {
                await notifyNextClaimApprovers(claim, req.app, employee._id?.toString());
            } else {
                await createNotificationWithPrivileges(
                    {
                        type: 'ClaimApproved',
                        referenceModel: 'Claim',
                        title: 'Claim approved',
                        message: `Your claim of ${claim.amount} QAR for ${claim.reason} has been approved.`,
                        sentBy: employee._id?.toString(),
                        referenceId: claim._id,
                        additionalData
                    },
                    raiserFilter,
                    socket
                );
            }
        }

        const updatedClaim = await Claim.findById(id)
            .populate('raisedBy')
            .populate('approvalStatus.role')
            .populate('approvalStatus.updatedBy');

        return res.status(200).json({
            success: true,
            message: `Claim ${status} successfully`,
            data: updatedClaim
        });

    } catch (error) {
        console.error('Error updating claim status:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update claim status",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getApprovalsByEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userToken = req.user;
        const { page = 1, row = 10 } = req.query;

        const pageNum = parseInt(page as string);
        const rowNum = parseInt(row as string);
        const skip = (pageNum - 1) * rowNum;

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        const pipeline: any[] = [
            {
                $lookup: {
                    from: "employees",
                    localField: "raisedBy",
                    foreignField: "_id",
                    as: "raisedBy"
                }
            },
            {
                $unwind: "$raisedBy"
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "raisedBy.reportingTo",
                    foreignField: "_id",
                    as: "raisedBy.reportingTo"
                }
            },
            {
                $unwind: {
                    path: "$raisedBy.reportingTo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "approvalStatus.role",
                    foreignField: "_id",
                    as: "approvalRoles"
                }
            },
            {
                $lookup: {
                    from: "employees",
                    localField: "approvalStatus.updatedBy",
                    foreignField: "_id",
                    as: "approvalEmployees"
                }
            },
            {
                $lookup: {
                    from: "jobs",
                    localField: "jobId",
                    foreignField: "jobId",
                    as: "job"
                }
            },
            {
                $unwind: {
                    path: "$job",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $addFields: {
                    overallStatus: {
                        $let: {
                            vars: {
                                lastApproval: { $arrayElemAt: ["$approvalStatus", -1] }
                            },
                            in: "$$lastApproval.status"
                        }
                    }
                }
            },
            {
                $addFields: {
                    approvalStatus: {
                        $map: {
                            input: "$approvalStatus",
                            as: "approval",
                            in: {
                                $mergeObjects: [
                                    "$$approval",
                                    {
                                        role: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$approvalRoles",
                                                        cond: { $eq: ["$$this._id", "$$approval.role"] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        updatedBy: {
                                            $cond: {
                                                if: { $ne: ["$$approval.updatedBy", null] },
                                                then: {
                                                    $arrayElemAt: [
                                                        {
                                                            $filter: {
                                                                input: "$approvalEmployees",
                                                                cond: { $eq: ["$$this._id", "$$approval.updatedBy"] }
                                                            }
                                                        },
                                                        0
                                                    ]
                                                },
                                                else: null
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    nextPendingStep: {
                        $min: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$approvalStatus",
                                        cond: { $eq: ["$$this.status", "pending"] }
                                    }
                                },
                                as: "pending",
                                in: "$$pending.step"
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    isNextApprover: {
                        $anyElementTrue: {
                            $map: {
                                input: "$approvalStatus",
                                as: "approval",
                                in: {
                                    $and: [
                                        { $eq: ["$$approval.status", "pending"] },
                                        { $eq: ["$$approval.step", "$nextPendingStep"] },
                                        {
                                            $cond: {
                                                if: { $eq: ["$$approval.managerApproval", true] },
                                                then: { $eq: ["$raisedBy.reportingTo._id", new ObjectId(employee._id)] },
                                                else: { $eq: ["$$approval.role._id", new ObjectId(employee.category._id)] }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $match: {
                    isNextApprover: true
                }
            },
            { $skip: skip },
            { $limit: rowNum }
        ];

        const claims = await Claim.aggregate(pipeline);
        const totalPipeline: any[] = [...pipeline.slice(0, -2)];
        totalPipeline.push({ $count: "total" });
        const totalResult = await Claim.aggregate(totalPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        if (claims.length > 0) {
            return res.status(200).json({
                success: true,
                data: claims,
                pagination: {
                    page: pageNum,
                    row: rowNum,
                    total: total,
                    totalPages: Math.ceil(total / rowNum)
                }
            });
        }

        return res.status(204).json({
            success: true,
            message: "No pending approvals found"
        });

    } catch (error) {
        console.error('Error fetching approvals:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch approvals",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const deleteClaim = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userToken = req.user;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID"
            });
        }

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        const claim = await Claim.findById(id);
        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Claim not found"
            });
        }

        if (claim.raisedBy.toString() !== employee._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own claims"
            });
        }

        const hasApprovals = claim.approvalStatus.some(status => status.status === 'approved');
        if (hasApprovals) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete claim with existing approvals"
            });
        }

        await Claim.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Claim deleted successfully"
        });

    } catch (error) {
        console.error('Error deleting claim:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete claim",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const removeClaimAttachment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { fileName } = req.body;
        const userToken = req.user;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID"
            });
        }

        const employee = await getEmployeeData(userToken);
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: "Employee not found"
            });
        }

        const claim = await Claim.findById(id);
        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Claim not found"
            });
        }

        if (claim.raisedBy.toString() !== employee._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only remove attachments from your own claims"
            });
        }

        const attachmentIndex = claim.attachements.findIndex((att: any) => att.fileName === fileName);
        if (attachmentIndex !== -1) {
            claim.attachements.splice(attachmentIndex, 1);
            await claim.save();

            const updatedClaim = await Claim.findById(id)
                .populate('raisedBy')
                .populate('approvalStatus.role')
                .populate('approvalStatus.updatedBy');

            return res.status(200).json({
                success: true,
                message: "Attachment removed successfully",
                data: updatedClaim
            });
        } else {
            return res.status(404).json({
                success: false,
                message: "Attachment not found"
            });
        }

    } catch (error) {
        console.error('Error removing attachment:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to remove attachment",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
