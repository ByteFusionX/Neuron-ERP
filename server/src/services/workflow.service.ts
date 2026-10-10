import Workflow from "../models/workflow.model";
import Employee from "../models/employee.model";
import WorkflowDelegation from "../models/workflowDelegation.model";
import Category from "../models/category.model";

interface ApprovalContext {
    amount?: number | null;
    discountPercent?: number | null;
    /** Employee who raised the request; they can never approve their own request. */
    requesterId?: any;
    [key: string]: any;
}

const idsMatch = (left: any, right: any) => {
    return left?.toString() === right?.toString();
};

const toFiniteNumber = (value: any): number | null => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const enforceApprovalLimits = (employee: any, context?: ApprovalContext) => {
    const amount = toFiniteNumber(context?.amount);
    const maxAmount = toFiniteNumber(employee?.approvalLimit?.maxAmount);
    if (amount !== null && maxAmount !== null && amount > maxAmount) {
        throw new Error(`This approval is above your configured approval limit of ${maxAmount}`);
    }

    const discountPercent = toFiniteNumber(context?.discountPercent);
    const maxDiscountPercent = toFiniteNumber(employee?.approvalLimit?.maxDiscountPercent);
    if (discountPercent !== null && maxDiscountPercent !== null && discountPercent > maxDiscountPercent) {
        throw new Error(`This approval discount is above your configured discount limit of ${maxDiscountPercent}%`);
    }
};

// Qatar is UTC+3 all year; working days and hours are evaluated in that local clock.
const WORKDAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];
export const DEFAULT_CONDITION_FLAGS = { time: true, amount: false, discount: false };

/** "HH:mm" -> minutes since midnight; falls back when blank or malformed. */
const clockMinutes = (value: any, fallback: number) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
    if (!match) return fallback;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes >= 0 && minutes <= 24 * 60 ? minutes : fallback;
};

/** The working window of a workflow: weekdays (0 = Sunday) plus start/end minutes of the day. */
export const workingWindow = (workflow: any) => {
    const startMin = clockMinutes(workflow?.workDayStart, 8 * 60);
    const endMin = clockMinutes(workflow?.workDayEnd, 17 * 60);
    return {
        workingDays: workflow?.workingDays?.length ? workflow.workingDays : DEFAULT_WORKING_DAYS,
        startMin,
        endMin: endMin > startMin ? endMin : 17 * 60,
    };
};

export const conditionFlagsOf = (workflow: any) => ({ ...DEFAULT_CONDITION_FLAGS, ...(workflow?.conditionFlags?.toObject?.() ?? workflow?.conditionFlags ?? {}) });

/** Adds `minutes` of working time: the clock only runs on working days, between the day's start and end time. */
export const addWorkingMinutes = (start: Date, minutes: number, window: { workingDays: number[]; startMin: number; endMin: number }) => {
    let remaining = minutes * 60 * 1000;
    let cursor = start.getTime();
    for (let guard = 0; guard < 4000 && remaining > 0; guard++) {
        const dayStart = Math.floor((cursor + WORKDAY_OFFSET_MS) / DAY_MS) * DAY_MS;
        const weekday = new Date(dayStart).getUTCDay();
        const nextDay = dayStart + DAY_MS - WORKDAY_OFFSET_MS;
        if (!window.workingDays.includes(weekday)) { cursor = nextDay; continue; }

        const opens = dayStart - WORKDAY_OFFSET_MS + window.startMin * 60 * 1000;
        const closes = dayStart - WORKDAY_OFFSET_MS + window.endMin * 60 * 1000;
        if (cursor < opens) cursor = opens;
        if (cursor >= closes) { cursor = nextDay; continue; }

        const chunk = Math.min(remaining, closes - cursor);
        cursor += chunk;
        remaining -= chunk;
    }
    return new Date(cursor);
};

/** When a time limit of `minutes` that starts at `start` runs out, counting working time only. */
export const dueAfterWorkingTime = (workflow: any, start: Date, minutes: number) => addWorkingMinutes(start, minutes, workingWindow(workflow));

const getActiveDelegation =async (fromEmployee: any, at = new Date()) => {
    if (!fromEmployee) return null;

    return WorkflowDelegation.findOne({
        fromEmployee,
        active: true,
        startDate: { $lte: at },
        endDate: { $gte: at }
    }).lean();
};

const applyDelegation = async (approver: any, step: any) => {
    const delegation = await getActiveDelegation(approver);
    if (!delegation) return { approver, step };

    return {
        approver: delegation.toEmployee,
        step: {
            ...step,
            approver: delegation.toEmployee,
            delegatedFrom: approver,
            delegationId: delegation._id,
        }
    };
};

const contextValue = (context: ApprovalContext | undefined, field: string) => {
    if (!context || !field) return undefined;
    return field.split('.').reduce((value: any, part) => value?.[part], context);
};

const conditionMatches = (condition: any, context?: ApprovalContext) => {
    const actual = contextValue(context, condition.field);
    const expected = condition.value;

    switch (condition.operator) {
        case 'equals':
            return actual === expected;
        case 'notEquals':
            return actual !== expected;
        case 'greaterThan':
            return Number(actual) > Number(expected);
        case 'greaterThanOrEqual':
            return Number(actual) >= Number(expected);
        case 'lessThan':
            return Number(actual) < Number(expected);
        case 'lessThanOrEqual':
            return Number(actual) <= Number(expected);
        case 'in':
            return Array.isArray(expected) && expected.includes(actual);
        case 'notIn':
            return Array.isArray(expected) && !expected.includes(actual);
        case 'exists':
            return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null;
        default:
            return false;
    }
};

const workflowConditionsMatch = (workflow: any, context?: ApprovalContext) => {
    if (!workflow.conditions?.length) return true;
    return workflow.conditions.every((condition: any) => conditionMatches(condition, context));
};

export const getWorkflowSteps = async (workflowFeature: string, employeeId: string, context?: ApprovalContext) => {
    try {
        const workflow = await Workflow.findOne({ feature: workflowFeature }).populate('steps.role');

        // Admin is pinned on top of every workflow, so a workflow without other steps still routes to Admin.
        if (!workflow) {
            throw new Error(`No workflow configured for ${workflowFeature} claims`);
        }

        if (!workflowConditionsMatch(workflow, context)) {
            return [];
        }

        const employeeData = await Employee.findOne({ _id: employeeId }).populate('reportingTo');
        const isReportingToExist = employeeData.reportingTo && employeeData.reportingTo !== null;
        
        let approvalStatus = [];
        if(workflow.needsManagerApproval && isReportingToExist) {
            const managerApprover = employeeData.reportingTo._id;
            const delegated = await applyDelegation(managerApprover, {
                status: 'pending',
                managerApproval: true,
                approver: managerApprover,
                step: 0,
                assignedAt: new Date(),
            });
            approvalStatus.push(delegated.step);
        }

        const now = new Date();
        const amount = toFiniteNumber(context?.amount);
        const discount = toFiniteNumber(context?.discountPercent);
        const requesterRole = employeeData.category?._id ?? employeeData.category;
        const adminRole = await Category.findOne({ role: /^superadmin$/i }).select('_id').lean();

        // Bottom step first: the highest order number approves first and the route climbs towards order 1 (Admin).
        const ordered = workflow.steps.filter(step => step.enabled !== false).sort((a, b) => b.order - a.order);

        // A step cannot approve above its amount / discount limit, so bigger requests skip it. Unknown values keep the step.
        const withinLimits = ordered.filter(step =>
            !(amount !== null && step.maxAmount && amount > step.maxAmount) &&
            !(discount !== null && step.maxDiscount && discount > step.maxDiscount)
        );

        // Requester already holds the stage's role -> skip it (always on), but never leave the route without an approver.
        // Requester is Admin: nobody above them, so nothing to approve.
        if (requesterRole && adminRole && idsMatch(adminRole._id, requesterRole) && !approvalStatus.length) {
            return [];
        }

        // Requester sits in the route: their stage and every stage below it (acting earlier) are skipped,
        // so the request starts at the first stage above them. An "Or" stage is skipped as a whole.
        let routed = withinLimits;
        if (requesterRole) {
            const own = ordered.filter(step => idsMatch((step.role as any)?._id ?? step.role, requesterRole));
            if (own.length) {
                const ownTop = Math.min(...own.map(step => step.order));
                routed = withinLimits.filter(step => step.order < ownTop);
            }
        }

        // Roles sharing an order form one any-of stage; stages are numbered in the order they act.
        const stages: any[][] = [];
        routed.forEach(step => {
            const last = stages[stages.length - 1];
            if (last && last[0].order === step.order) last.push(step);
            else stages.push([step]);
        });

        if (!stages.length && adminRole) {
            // Nobody below Admin can approve this request (or none is configured): Admin decides alone, no limits.
            approvalStatus.push({
                status: 'pending',
                role: adminRole._id,
                step: 1,
                managerApproval: false,
                assignedAt: now,
                workflowVersion: workflow.version ?? 1,
            });
            return approvalStatus;
        }

        const window = workingWindow(workflow);
        const unitMinutes = (unit?: string) => unit === 'day' ? 24 * 60 : unit === 'minute' ? 1 : 60;
        const managerSteps = approvalStatus.length;

        stages.forEach((group, index) => {
            const above = stages[index + 1]?.[0]?.role ?? adminRole?._id;
            group.forEach(step => {
                const timed = step.escalationHours;
                const windowMinutes = timed ? step.escalationHours * unitMinutes(step.escalationUnit) : 0;
                const action = step.timeoutAction || 'escalate';
                approvalStatus.push({
                    status: 'pending',
                    role: step.role,
                    step: managerSteps + index + 1,
                    managerApproval: false,
                    assignedAt: now,
                    workflowVersion: workflow.version ?? 1,
                    timeoutAction: timed ? action : undefined,
                    ...(timed ? {
                        escalationDueAt: addWorkingMinutes(now, windowMinutes, window),
                        ...(step.reminderPercent && step.reminderEnabled !== false ? { reminderDueAt: addWorkingMinutes(now, windowMinutes * step.reminderPercent / 100, window) } : {}),
                    } : {}),
                    ...(timed && action === 'escalate' && above ? { escalationRole: above } : {}),
                });
            });
        });

        return approvalStatus;
    } catch (error) {
        throw new Error(error);
    }
}

export const updateApprovalStatus = async (status: string, approvalStatus: any, comment: string, employee: any, context?: ApprovalContext) => {
    try {
        approvalStatus = escalateApprovalStatus(approvalStatus);

        const pendingStatuses = approvalStatus
            .filter(approval => approval.status === 'pending')
            .sort((a, b) => a.step - b.step);

        if (pendingStatuses.length === 0) {
            throw new Error('No pending approvals found');
        }

        if (context?.requesterId && idsMatch(context.requesterId, employee._id)) {
            throw new Error('You cannot approve or reject a request that you raised');
        }

        const currentStep = pendingStatuses[0].step;
        const currentApprovals = pendingStatuses.filter(approval => approval.step === currentStep);

        // Admin sits on top of every workflow with no limits: they can act on whatever step is current.
        const isAdmin = /^superadmin$/i.test(employee?.category?.role ?? '');

        const nextApproval = currentApprovals.find(approval => {
            if (approval.managerApproval) {
                return idsMatch(approval.approver, employee._id);
            }

            return approval.role && idsMatch(approval.role._id || approval.role, employee.category._id);
        }) ?? (isAdmin ? currentApprovals[0] : undefined);

        if (!nextApproval) {
            throw new Error('You are not authorized to approve this step');
        }

        if (!isAdmin && nextApproval.managerApproval && !idsMatch(nextApproval.approver, employee._id)) {
            throw new Error('Only the reporting manager can approve this step');
        }

        if (!isAdmin && nextApproval.role && !idsMatch(nextApproval.role._id || nextApproval.role, employee.category._id)) {
            throw new Error('You are not authorized to approve this step');
        }

        if (status === 'approved' && !isAdmin) {
            enforceApprovalLimits(employee, context);
        }

        const approvalIndex = approvalStatus.findIndex(
            approval => idsMatch(approval._id, nextApproval._id)
        );

        if (approvalIndex === -1) {
            throw new Error('Approval step not found');
        }

        approvalStatus[approvalIndex].status = status;
        approvalStatus[approvalIndex].updatedBy = employee._id;
        approvalStatus[approvalIndex].updatedDate = new Date();
        approvalStatus[approvalIndex].comment = comment;
        if (status === 'rejected') {
            approvalStatus = approvalStatus.filter(approval => approval.status !== 'pending');
        } else if (status === 'approved' && currentApprovals.length > 1) {
            // A stage holding several roles is any-of: one approval completes it, so the other roles drop out.
            const approvedId = approvalStatus[approvalIndex]._id;
            approvalStatus = approvalStatus.filter(approval =>
                !(approval.status === 'pending' && approval.step === currentStep && !idsMatch(approval._id, approvedId))
            );
        }

        if (status === 'approved' && (nextApproval.escalatedAt || isAdmin)) {
            // Admin's approval is final and closes every remaining stage. An escalated approver has also signed off
            // for their own role, so their later stages are done too.
            const approverRole = employee.category._id;
            const approvedId = approvalStatus[approvalIndex]._id;
            approvalStatus = approvalStatus.filter(approval =>
                !(approval.status === 'pending' && !idsMatch(approval._id, approvedId) && (isAdmin || (approval.role && idsMatch(approval.role._id || approval.role, approverRole))))
            );
        }

        return approvalStatus;
    } catch (error) {
        throw new Error(error);
    }
}

export const escalateApprovalStatus = (approvalStatus: any[], now = new Date()) => {
    return approvalStatus.map(approval => {
        if (approval.status !== 'pending' || approval.escalatedAt || !approval.escalationDueAt) {
            return approval;
        }

        // notify / reject stages are handled by the timeout cron, not by moving the step up.
        if (approval.timeoutAction && approval.timeoutAction !== 'escalate') {
            return approval;
        }

        if (new Date(approval.escalationDueAt) > now) {
            return approval;
        }

        const escalatedApproval = {
            ...approval,
            escalatedAt: now,
        };

        if (approval.escalationRole) {
            escalatedApproval.originalRole = approval.role;
            escalatedApproval.role = approval.escalationRole;
        }

        return escalatedApproval;
    });
};

export const getEnabledAutoActions = async (workflowFeature: string, triggerStatus: string, context?: ApprovalContext) => {
    const workflow = await Workflow.findOne({ feature: workflowFeature }).lean();
    if (!workflow || !workflowConditionsMatch(workflow, context)) return [];

    return (workflow.autoActions || []).filter((action: any) => action.enabled && action.triggerStatus === triggerStatus);
};
