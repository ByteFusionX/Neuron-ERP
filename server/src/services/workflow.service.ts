import Workflow from "../models/workflow.model";
import Employee from "../models/employee.model";
import WorkflowDelegation from "../models/workflowDelegation.model";

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

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);

// Qatar is UTC+3 all year; working days are evaluated in that local calendar.
const WORKDAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds hours but pauses the clock on non-working days (0 = Sunday). */
export const addBusinessHours = (start: Date, hours: number, workingDays: number[]) => {
    if (!workingDays?.length) return addHours(start, hours);

    let remaining = hours * 60 * 60 * 1000;
    let cursor = start.getTime();
    for (let guard = 0; guard < 4000 && remaining > 0; guard++) {
        const dayStart = Math.floor((cursor + WORKDAY_OFFSET_MS) / DAY_MS) * DAY_MS;
        const weekday = new Date(dayStart).getUTCDay();
        const dayEnd = dayStart + DAY_MS - WORKDAY_OFFSET_MS;
        if (workingDays.includes(weekday)) {
            const chunk = Math.min(remaining, dayEnd - cursor);
            cursor += chunk;
            remaining -= chunk;
        } else {
            cursor = dayEnd;
        }
    }
    return new Date(cursor);
};

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

        if (!workflow || (!workflow.steps.length && !workflow.needsManagerApproval)) {
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
        const requesterRole = employeeData.category?._id ?? employeeData.category;
        const orderedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);

        // Amount threshold: a stage with minAmount is skipped for smaller requests (unknown amount keeps the stage).
        const applicable = orderedSteps.filter(step => !(step.minAmount && amount !== null && amount < step.minAmount));

        // Requester already holds the stage's role -> skip it, but never leave the route without an approver.
        let routed = applicable;
        if (workflow.skipRequesterRole !== false && requesterRole) {
            const withoutSelf = applicable.filter(step => !idsMatch((step.role as any)?._id ?? step.role, requesterRole));
            routed = withoutSelf.length || approvalStatus.length ? withoutSelf : applicable;
        }

        const dueAfter = (hours: number, unit?: string) => workflow.businessHoursOnly && unit !== 'minute'
            ? addBusinessHours(now, hours, workflow.workingDays?.length ? workflow.workingDays : [0, 1, 2, 3, 4])
            : addHours(now, hours);
        const unitHours = (unit?: string) => unit === 'day' ? 24 : unit === 'minute' ? 1 / 60 : 1;

        approvalStatus.push(...routed.map(step => ({
            status: 'pending',
            role: step.role,
            step: step.order,
            managerApproval: false,
            assignedAt: now,
            workflowVersion: workflow.version ?? 1,
            timeoutAction: step.timeoutAction || 'escalate',
            ...(step.escalationHours ? {
                escalationDueAt: dueAfter(step.escalationHours * unitHours(step.escalationUnit), step.escalationUnit),
                ...(step.reminderPercent ? { reminderDueAt: dueAfter(step.escalationHours * unitHours(step.escalationUnit) * step.reminderPercent / 100, step.escalationUnit) } : {}),
            } : {}),
            escalationRole: step.escalationRole,
        })));

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

        const nextApproval = currentApprovals.find(approval => {
            if (approval.managerApproval) {
                return idsMatch(approval.approver, employee._id);
            }

            return approval.role && idsMatch(approval.role._id || approval.role, employee.category._id);
        });

        if (!nextApproval) {
            throw new Error('You are not authorized to approve this step');
        }

        if (nextApproval.managerApproval && !idsMatch(nextApproval.approver, employee._id)) {
            throw new Error('Only the reporting manager can approve this step');
        }

        if (nextApproval.role && !idsMatch(nextApproval.role._id || nextApproval.role, employee.category._id)) {
            throw new Error('You are not authorized to approve this step');
        }

        if (status === 'approved') {
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
