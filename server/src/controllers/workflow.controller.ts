import { Request, Response, NextFunction } from "express";
import Workflow from '../models/workflow.model';
import WorkflowDelegation from "../models/workflowDelegation.model";
import { ObjectId } from "mongodb";
import { getEmployeeData } from "../common/utils/util";
import Category from "../models/category.model";
import { DEFAULT_CONDITION_FLAGS, DEFAULT_WORKING_DAYS } from "../services/workflow.service";

const validateWorkflowSteps = (steps: any[], allowEmpty = false) => {
    // Admin is pinned on top of every workflow automatically, so a workflow may have no other steps.
    if (!Array.isArray(steps) || (steps.length === 0 && !allowEmpty)) {
        return { valid: false, message: "Steps must be a list" };
    }

    const roleIds = new Set<string>();
    const stepRoleKeys = new Set<string>();

    for (const step of steps) {
        const roleId = step?.role?.toString();
        const order = Number(step?.order);
        const stepKey = `${order}:${roleId}`;

        if (!roleId || !ObjectId.isValid(roleId)) {
            return { valid: false, message: "Each approval step must have a valid role" };
        }

        if (!Number.isInteger(order) || order < 1) {
            return { valid: false, message: "Each approval step must have a positive order" };
        }

        if (roleIds.has(roleId)) {
            return { valid: false, message: "Duplicate roles are not allowed in a workflow" };
        }

        if (step?.escalationRole && !ObjectId.isValid(step.escalationRole.toString())) {
            return { valid: false, message: "Escalation role must be valid" };
        }

        if (step?.escalationHours !== undefined && (!Number.isInteger(Number(step.escalationHours)) || Number(step.escalationHours) < 1)) {
            return { valid: false, message: "Escalation hours must be a positive number" };
        }

        if (step?.escalationUnit && !['minute', 'hour', 'day'].includes(step.escalationUnit)) {
            return { valid: false, message: "Time limit unit must be minute, hour or day" };
        }

        if (step?.maxAmount !== undefined && step.maxAmount !== null && (!Number.isFinite(Number(step.maxAmount)) || Number(step.maxAmount) < 0)) {
            return { valid: false, message: "Maximum amount must be zero or more" };
        }

        if (step?.maxDiscount !== undefined && step.maxDiscount !== null && (!Number.isFinite(Number(step.maxDiscount)) || Number(step.maxDiscount) < 0 || Number(step.maxDiscount) > 100)) {
            return { valid: false, message: "Maximum discount must be between 0% and 100%" };
        }

        if (step?.reminderPercent !== undefined && step.reminderPercent !== null && (!Number.isInteger(Number(step.reminderPercent)) || Number(step.reminderPercent) < 1 || Number(step.reminderPercent) > 99)) {
            return { valid: false, message: "Reminder must be between 1% and 99% of the time limit" };
        }

        if (step?.timeoutAction && !['escalate', 'notify', 'reject'].includes(step.timeoutAction)) {
            return { valid: false, message: "Timeout action must be escalate, notify or reject" };
        }

        if (stepRoleKeys.has(stepKey)) {
            return { valid: false, message: "Duplicate roles are not allowed in the same workflow step" };
        }

        roleIds.add(roleId);
        stepRoleKeys.add(stepKey);
    }

    return { valid: true };
};

/** Conditions a module may use. Presale only has a time limit; amounts and discounts belong to purchases and deals. */
const ALLOWED_CONDITIONS: Record<string, string[]> = {
    presale: ['time'],
    purchaseApproval: ['time', 'amount'],
    poApproval: ['time', 'amount'],
    dealSheet: ['time', 'amount', 'discount'],
    claim: ['time', 'amount'],
    projectClaim: ['time', 'amount'],
};

const normalizeConditionFlags = (feature: string, flags: any) => {
    const allowed = ALLOWED_CONDITIONS[feature] ?? ['time', 'amount', 'discount'];
    const base = { ...DEFAULT_CONDITION_FLAGS, ...(flags && typeof flags === 'object' ? flags : {}) };
    return {
        time: allowed.includes('time') && base.time === true,
        amount: allowed.includes('amount') && base.amount === true,
        discount: allowed.includes('discount') && base.discount === true,
    };
};

const normalizeConditionDefaults = (defaults: any) => {
    const num = (value: any, min: number, max = Infinity) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
    };
    return {
        timeLimit: num(defaults?.timeLimit, 1),
        timeUnit: ['minute', 'hour', 'day'].includes(defaults?.timeUnit) ? defaults.timeUnit : undefined,
        timeoutAction: ['escalate', 'notify', 'reject'].includes(defaults?.timeoutAction) ? defaults.timeoutAction : undefined,
        reminderPercent: num(defaults?.reminderPercent, 1, 99),
        maxAmount: num(defaults?.maxAmount, 0),
        maxDiscount: num(defaults?.maxDiscount, 0, 100),
    };
};

/** Steps in stored order. Each step keeps only the conditions it was created with (a field it holds is a field it uses). */
const normalizeWorkflowSteps = (steps: any[], feature: string) => {
    const allowed = ALLOWED_CONDITIONS[feature] ?? ['time', 'amount', 'discount'];
    return [...steps]
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((step) => {
            const timed = allowed.includes('time') && step.escalationHours !== undefined && step.escalationHours !== null;
            return {
                role: step.role,
                order: Number(step.order),
                enabled: step.enabled !== false,
                ...(timed ? {
                    escalationHours: Number(step.escalationHours),
                    escalationUnit: ['minute', 'hour', 'day'].includes(step.escalationUnit) ? step.escalationUnit : 'hour',
                    reminderPercent: step.reminderPercent ? Number(step.reminderPercent) : undefined,
                    timeoutAction: step.timeoutAction || 'escalate',
                    reminderEnabled: step.reminderEnabled !== false,
                } : {}),
                maxAmount: allowed.includes('amount') && step.maxAmount ? Number(step.maxAmount) : undefined,
                maxDiscount: allowed.includes('discount') && step.maxDiscount ? Number(step.maxDiscount) : undefined,
            };
        });
};

/** Admin is added automatically on top of every workflow, so Super Admin roles are never stored as steps. */
const withoutAdminRoles = async (steps: any[]) => {
    const admins = await Category.find({ role: /^superadmin$/i }).select('_id').lean();
    const adminIds = new Set(admins.map((c: any) => c._id.toString()));
    return steps.filter(step => !adminIds.has(step?.role?.toString()));
};

/** Presale steps assign jobs, so every newly added role must hold the assign privilege (roles already in the workflow that lose it are switched off at run time). */
const presaleRolesMissingPrivilege = async (steps: any[], keep: string[] = []) => {
    const roles = await Category.find({ _id: { $in: steps.map(step => step.role).filter(id => !keep.includes(String(id))) } }).select('categoryName privileges.assignedJob.assign').lean();
    return roles.filter((role: any) => role.privileges?.assignedJob?.assign !== true).map((role: any) => role.categoryName);
};

/** Deal sheet stages approve deals, so every newly added role must hold the deal sheet privilege (the approve endpoint is gated on it). */
const dealSheetRolesMissingPrivilege = async (steps: any[], keep: string[] = []) => {
    const roles = await Category.find({ _id: { $in: steps.map(step => step.role).filter(id => !keep.includes(String(id))) } }).select('categoryName privileges.dealSheet').lean();
    return roles.filter((role: any) => role.privileges?.dealSheet !== true).map((role: any) => role.categoryName);
};

const normalizeClock = (value: any, fallback: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
    if (!match) return fallback;
    const [h, m] = [Number(match[1]), Number(match[2])];
    return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${match[2]}` : fallback;
};

const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

const normalizeWorkingDays = (days: any): number[] | undefined => {
    if (!Array.isArray(days)) return undefined;
    return [...new Set(days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
};

const validateConditions = (conditions: any[] = []) => {
    const operators = new Set(['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'in', 'notIn', 'exists']);
    for (const condition of conditions) {
        if (!condition?.field || typeof condition.field !== 'string') {
            return { valid: false, message: "Each condition must have a field" };
        }

        if (!operators.has(condition?.operator)) {
            return { valid: false, message: "Each condition must have a valid operator" };
        }
    }

    return { valid: true };
};

const validateAutoActions = (autoActions: any[] = []) => {
    const actions = new Set(['createSalesOrder', 'createProject']);
    for (const autoAction of autoActions) {
        if (!autoAction?.triggerStatus || typeof autoAction.triggerStatus !== 'string') {
            return { valid: false, message: "Each auto action must have a trigger status" };
        }

        if (!actions.has(autoAction?.action)) {
            return { valid: false, message: "Each auto action must have a valid action" };
        }
    }

    return { valid: true };
};

export const createWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { feature, steps: rawSteps, needsManagerApproval, repeatReminder, workingDays, workDayStart, workDayEnd, conditionFlags, conditionDefaults, conditions = [], autoActions = [] } = req.body;

        if (!feature || !rawSteps || !Array.isArray(rawSteps)) {
            return res.status(400).json({
                success: false,
                message: "Feature and steps are required"
            });
        }

        const steps = await withoutAdminRoles(rawSteps);
        if (feature === 'presale') {
            const missing = await presaleRolesMissingPrivilege(steps);
            if (missing.length) return res.status(400).json({ success: false, message: `These roles cannot assign presale jobs: ${missing.join(', ')}` });
        }
        if (feature === 'dealSheet') {
            const missing = await dealSheetRolesMissingPrivilege(steps);
            if (missing.length) return res.status(400).json({ success: false, message: `These roles cannot approve deal sheets: ${missing.join(', ')}` });
        }
        const stepValidation = validateWorkflowSteps(steps, true);
        if (!stepValidation.valid) {
            return res.status(400).json({
                success: false,
                message: stepValidation.message
            });
        }

        const conditionValidation = validateConditions(conditions);
        if (!conditionValidation.valid) {
            return res.status(400).json({
                success: false,
                message: conditionValidation.message
            });
        }

        const autoActionValidation = validateAutoActions(autoActions);
        if (!autoActionValidation.valid) {
            return res.status(400).json({
                success: false,
                message: autoActionValidation.message
            });
        }

        const existingWorkflow = await Workflow.findOne({ feature });
        if (existingWorkflow) {
            return res.status(409).json({
                success: false,
                message: "Workflow for this feature already exists"
            });
        }

        const flags = normalizeConditionFlags(feature, conditionFlags);
        const start = normalizeClock(workDayStart, '08:00');
        const end = normalizeClock(workDayEnd, '17:00');
        if (toMinutes(end) <= toMinutes(start)) {
            return res.status(400).json({ success: false, message: "Work day must end after it starts" });
        }

        const workflow = await Workflow.create({
            feature,
            steps: normalizeWorkflowSteps(steps, feature),
            needsManagerApproval: needsManagerApproval || false,
            skipRequesterRole: true,
            repeatReminder: repeatReminder !== false,
            businessHoursOnly: true,
            workingDays: normalizeWorkingDays(workingDays)?.length ? normalizeWorkingDays(workingDays) : DEFAULT_WORKING_DAYS,
            workDayStart: start,
            workDayEnd: end,
            conditionFlags: flags,
            conditionDefaults: normalizeConditionDefaults(conditionDefaults),
            layoutVersion: 2,
            conditions,
            autoActions
        });

        return res.status(201).json({
            success: true,
            message: "Workflow created successfully",
            data: workflow
        });

    } catch (error) {
        console.error('Error creating workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to create workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getWorkflows = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { feature, page = 1, row = 1000 } = req.query;

        const pageNum = parseInt(page as string);
        const rowNum = parseInt(row as string);
        const skip = (pageNum - 1) * rowNum;

        const filter: any = {};
        if (feature) {
            filter.feature = feature;
        }

        const workflows = await Workflow.find(filter)
            .sort({ feature: 1 })
            .populate('steps.role')
            .skip(skip)
            .limit(rowNum);

        const totalCount = await Workflow.countDocuments(filter);

        if (workflows.length > 0) {
            return res.status(200).json({
                success: true,
                data: workflows,
                pagination: {
                    page: pageNum,
                    row: rowNum,
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / rowNum)
                }
            });
        }

        return res.status(204).json({
            success: true,
            message: "No workflows found"
        });

    } catch (error) {
        console.error('Error fetching workflows:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch workflows",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { feature, steps: rawSteps, needsManagerApproval, repeatReminder, workingDays, workDayStart, workDayEnd, conditionFlags, conditionDefaults, conditions, autoActions } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workflow ID"
            });
        }

        const workflow = await Workflow.findById(id);
        if (!workflow) {
            return res.status(404).json({
                success: false,
                message: "Workflow not found"
            });
        }

        if (feature && feature !== workflow.feature) {
            const existingWorkflow = await Workflow.findOne({ 
                feature, 
                _id: { $ne: id } 
            });
            if (existingWorkflow) {
                return res.status(409).json({
                    success: false,
                    message: "Another workflow for this feature already exists"
                });
            }
        }

        const updateData: any = {};
        if (feature) updateData.feature = feature;
        const targetFeature = feature || workflow.feature;

        const currentFlags = (workflow as any).conditionFlags?.toObject?.() ?? (workflow as any).conditionFlags;
        const flags = normalizeConditionFlags(targetFeature, conditionFlags !== undefined ? conditionFlags : currentFlags);
        if (conditionFlags !== undefined) updateData.conditionFlags = flags;
        if (conditionDefaults !== undefined) updateData.conditionDefaults = normalizeConditionDefaults(conditionDefaults);

        // Condition switches only shape new steps; stored steps keep what they were created with.
        if (rawSteps !== undefined) {
            const source = rawSteps !== undefined
                ? await withoutAdminRoles(rawSteps)
                : (workflow.steps as any[]).map(step => step.toObject());
            if (targetFeature === 'presale' && rawSteps !== undefined) {
                const missing = await presaleRolesMissingPrivilege(source, (workflow.steps as any[]).map(step => String(step.role)));
                if (missing.length) {
                    return res.status(400).json({ success: false, message: `These roles cannot assign presale jobs: ${missing.join(', ')}` });
                }
            }
            if (targetFeature === 'dealSheet') {
                const missing = await dealSheetRolesMissingPrivilege(source, (workflow.steps as any[]).map(step => String(step.role)));
                if (missing.length) {
                    return res.status(400).json({ success: false, message: `These roles cannot approve deal sheets: ${missing.join(', ')}` });
                }
            }
            const stepValidation = validateWorkflowSteps(source, true);
            if (!stepValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: stepValidation.message
                });
            }

            updateData.steps = normalizeWorkflowSteps(source, targetFeature);
        }
        if (needsManagerApproval !== undefined) {
            updateData.needsManagerApproval = needsManagerApproval;
        }
        if (repeatReminder !== undefined) {
            updateData.repeatReminder = repeatReminder !== false;
        }
        const days = normalizeWorkingDays(workingDays);
        if (days?.length) {
            updateData.workingDays = days;
        }
        if (workDayStart !== undefined || workDayEnd !== undefined) {
            const start = normalizeClock(workDayStart, (workflow as any).workDayStart || '08:00');
            const end = normalizeClock(workDayEnd, (workflow as any).workDayEnd || '17:00');
            if (toMinutes(end) <= toMinutes(start)) {
                return res.status(400).json({ success: false, message: "Work day must end after it starts" });
            }
            updateData.workDayStart = start;
            updateData.workDayEnd = end;
        }
        updateData.skipRequesterRole = true;
        updateData.businessHoursOnly = true;
        updateData.layoutVersion = 2;
        if (conditions !== undefined) {
            const conditionValidation = validateConditions(conditions);
            if (!conditionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: conditionValidation.message
                });
            }
            updateData.conditions = conditions;
        }
        if (autoActions !== undefined) {
            const autoActionValidation = validateAutoActions(autoActions);
            if (!autoActionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: autoActionValidation.message
                });
            }
            updateData.autoActions = autoActions;
        }

        const updatedWorkflow = await Workflow.findByIdAndUpdate(
            id,
            { ...updateData, $inc: { version: 1 } },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Workflow updated successfully",
            data: updatedWorkflow
        });

    } catch (error) {
        console.error('Error updating workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const deleteWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workflow ID"
            });
        }

        const workflow = await Workflow.findById(id);
        if (!workflow) {
            return res.status(404).json({
                success: false,
                message: "Workflow not found"
            });
        }

        await Workflow.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Workflow deleted successfully"
        });

    } catch (error) {
        console.error('Error deleting workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const createWorkflowDelegation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fromEmployee, toEmployee, startDate, endDate, reason } = req.body;
        const employee = await getEmployeeData(req.user);

        if (!ObjectId.isValid(fromEmployee) || !ObjectId.isValid(toEmployee)) {
            return res.status(400).json({ success: false, message: "Valid from and to employees are required" });
        }

        if (fromEmployee === toEmployee) {
            return res.status(400).json({ success: false, message: "Delegation must be assigned to another employee" });
        }

        const startsAt = new Date(startDate);
        const endsAt = new Date(endDate);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt > endsAt) {
            return res.status(400).json({ success: false, message: "Valid delegation start and end dates are required" });
        }

        const delegation = await WorkflowDelegation.create({
            fromEmployee,
            toEmployee,
            startDate: startsAt,
            endDate: endsAt,
            reason,
            createdBy: employee._id
        });

        return res.status(201).json({
            success: true,
            message: "Workflow delegation created successfully",
            data: delegation
        });
    } catch (error) {
        console.error('Error creating workflow delegation:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to create workflow delegation",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getWorkflowDelegations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { active } = req.query;
        const filter: any = {};
        if (active !== undefined) filter.active = active === 'true';

        const delegations = await WorkflowDelegation.find(filter)
            .populate('fromEmployee', 'firstName lastName employeeId')
            .populate('toEmployee', 'firstName lastName employeeId')
            .populate('createdBy', 'firstName lastName')
            .sort({ startDate: -1 });

        return res.status(200).json({
            success: true,
            data: delegations
        });
    } catch (error) {
        console.error('Error fetching workflow delegations:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch workflow delegations",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateWorkflowDelegation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { toEmployee, startDate, endDate, reason, active } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid delegation ID" });
        }

        const updateData: any = { updatedAt: new Date() };
        if (toEmployee !== undefined) {
            if (!ObjectId.isValid(toEmployee)) {
                return res.status(400).json({ success: false, message: "Valid delegate employee is required" });
            }
            updateData.toEmployee = toEmployee;
        }
        if (startDate !== undefined) updateData.startDate = new Date(startDate);
        if (endDate !== undefined) updateData.endDate = new Date(endDate);
        if (reason !== undefined) updateData.reason = reason;
        if (active !== undefined) updateData.active = active;

        if ((updateData.startDate && Number.isNaN(updateData.startDate.getTime())) || (updateData.endDate && Number.isNaN(updateData.endDate.getTime()))) {
            return res.status(400).json({ success: false, message: "Valid delegation dates are required" });
        }

        const updatedDelegation = await WorkflowDelegation.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!updatedDelegation) {
            return res.status(404).json({ success: false, message: "Workflow delegation not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Workflow delegation updated successfully",
            data: updatedDelegation
        });
    } catch (error) {
        console.error('Error updating workflow delegation:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update workflow delegation",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
