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
    // Number(null) is 0, which would read an unset limit as "may approve nothing".
    if (value === null || value === undefined || value === '') return null;
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

const PURCHASE_FLOW_FEATURES = ['purchaseApproval', 'poApproval'];

export const getWorkflowSteps = async (workflowFeature: string, employeeId: string, context?: ApprovalContext) => {
    try {
        let workflow: any = await Workflow.findOne({ feature: workflowFeature }).populate('steps.role');

        // Purchase and PO approval always run on the workflow: until one is saved, Admin decides alone.
        if (!workflow && PURCHASE_FLOW_FEATURES.includes(workflowFeature)) {
            workflow = { feature: workflowFeature, steps: [], version: 1, needsManagerApproval: false };
        }

        // Admin is pinned on top of every workflow, so a workflow without other steps still routes to Admin.
        if (!workflow) {
            throw new Error(`No workflow configured for ${workflowFeature} claims`);
        }

        const employeeData = await Employee.findOne({ _id: employeeId }).populate('reportingTo');

        if (!workflowConditionsMatch(workflow, context)) {
            // PR / PO never skip approval: with no matching route, Admin decides alone (even when Admin raised it).
            if (PURCHASE_FLOW_FEATURES.includes(workflowFeature)) {
                const skippedAdminRole = await Category.findOne({ role: /^superadmin$/i }).select('_id').lean();
                if (skippedAdminRole) {
                    return [{
                        status: 'pending',
                        role: skippedAdminRole._id,
                        step: 1,
                        managerApproval: false,
                        assignedAt: new Date(),
                        workflowVersion: workflow.version ?? 1,
                    }];
                }
            }
            return [];
        }
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
            // PR / PO: every other stage is skipped and Admin approves their own request, with no limits.
            if (PURCHASE_FLOW_FEATURES.includes(workflowFeature)) {
                return [{
                    status: 'pending',
                    role: adminRole._id,
                    step: 1,
                    managerApproval: false,
                    assignedAt: now,
                    workflowVersion: workflow.version ?? 1,
                }];
            }
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
                // A window set in minutes is meant as a short, real-time limit; only hour and day limits skip nights and weekends.
                const clock = (from: Date, minutes: number) => step.escalationUnit === 'minute'
                    ? new Date(from.getTime() + minutes * 60 * 1000)
                    : addWorkingMinutes(from, minutes, window);
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
                        escalationDueAt: clock(now, windowMinutes),
                        ...(step.reminderPercent && step.reminderEnabled !== false ? { reminderDueAt: clock(now, windowMinutes * step.reminderPercent / 100) } : {}),
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

/**
 * Super Admin restarts a pending request's route: the route is rebuilt from the current workflow, unticked stages are
 * dropped for this request only, and already-decided steps stay as history. Admin alone decides if nothing is ticked.
 */
export const rebuildPendingRoute = async (workflowFeature: string, requesterId: string, context: ApprovalContext, existing: any[], chosen: string[] | null) => {
    let stages: any[] = await getWorkflowSteps(workflowFeature, requesterId, context);
    const adminRole: any = await Category.findOne({ role: /^superadmin$/i }).select('_id').lean();
    if (chosen) {
        stages = stages.filter(stage => chosen.includes(String(stage.role?._id ?? stage.role)));
        if (!stages.length && adminRole) {
            stages = [{ status: 'pending', role: adminRole._id, step: 1, managerApproval: false, assignedAt: new Date() }];
        }
        const order = [...new Set(stages.map(stage => stage.step))].sort((a: any, b: any) => a - b);
        stages = stages.map(stage => ({ ...stage, step: order.indexOf(stage.step) + 1 }));
    }
    if (!stages.length) throw new Error('No approval route could be built for this request');
    const previous = (existing ?? []).map((a: any) => a?.toObject?.() ?? a).filter((a: any) => a.status !== 'pending');
    return [...previous, ...stages.map(stage => ({ ...stage, step: stage.step + previous.length }))];
};

export const updateApprovalStatus = async (status: string, approvalStatus: any, comment: string, employee: any, context?: ApprovalContext) => {
    try {
        approvalStatus = escalateApprovalStatus(approvalStatus);

        const pendingStatuses = approvalStatus
            .filter(approval => approval.status === 'pending')
            .sort((a, b) => a.step - b.step);

        if (pendingStatuses.length === 0) {
            throw new Error('No pending approvals found');
        }

        // Admin sits on top of every workflow with no limits: they can act on whatever step is current.
        const isAdmin = /^superadmin$/i.test(employee?.category?.role ?? '');

        // Everyone but Admin is barred from deciding their own request.
        if (!isAdmin && context?.requesterId && idsMatch(context.requesterId, employee._id)) {
            throw new Error('You cannot approve or reject a request that you raised');
        }

        const currentStep = pendingStatuses[0].step;
        const currentApprovals = pendingStatuses.filter(approval => approval.step === currentStep);

        const nextApproval = currentApprovals.find(approval => {
            if (approval.managerApproval) {
                return idsMatch(approval.approver, employee._id);
            }

            return approval.role && idsMatch(approval.role._id || approval.role, employee.category._id);
        }) ?? (isAdmin ? currentApprovals[0] : undefined);

        if (!nextApproval) {
            // A stage that ran out of time has moved up; say so instead of a bare "not authorized".
            const escalated = currentApprovals.find(approval => approval.escalatedAt && approval.escalationRole);
            if (escalated) {
                const target: any = await Category.findById(escalated.escalationRole, 'categoryName').lean();
                throw new Error(`This step passed its approval time limit and was escalated to ${target?.categoryName ?? 'the next role'}. Only they can decide it now`);
            }
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

        if (status === 'approved') startNextStageClock(approvalStatus);

        return approvalStatus;
    } catch (error) {
        throw new Error(error);
    }
}

/**
 * The time limits of every stage are stored when the request is submitted, but a stage only starts waiting once the
 * stage before it has decided. When a stage is approved, the next one's window (and reminder) restart from that moment.
 */
const startNextStageClock = (approvalStatus: any[], now = new Date()) => {
    const pending = approvalStatus.filter(approval => approval.status === 'pending');
    if (!pending.length) return;
    const nextStep = Math.min(...pending.map(approval => approval.step ?? 0));
    pending.filter(approval => (approval.step ?? 0) === nextStep && !approval.escalatedAt).forEach(approval => {
        if (!approval.escalationDueAt || !approval.assignedAt) return;
        const assigned = new Date(approval.assignedAt).getTime();
        const window = Math.max(new Date(approval.escalationDueAt).getTime() - assigned, 0);
        const reminder = approval.reminderDueAt ? Math.max(new Date(approval.reminderDueAt).getTime() - assigned, 0) : null;
        approval.assignedAt = now;
        approval.escalationDueAt = new Date(now.getTime() + window);
        if (reminder !== null) {
            approval.reminderDueAt = new Date(now.getTime() + reminder);
            approval.reminderSentAt = null;
        }
    });
};

export const escalateApprovalStatus = (approvalStatus: any[], now = new Date()) => {
    // Only the stage waiting right now can time out; later stages have not been handed to anyone yet.
    const pendingSteps = approvalStatus.filter(approval => approval.status === 'pending').map(approval => approval.step ?? 0);
    const currentStep = pendingSteps.length ? Math.min(...pendingSteps) : null;
    return approvalStatus.map(approval => {
        if (approval.status !== 'pending' || approval.escalatedAt || !approval.escalationDueAt || (currentStep !== null && (approval.step ?? 0) > currentStep)) {
            return approval;
        }

        // notify / reject stages are handled by the timeout cron, not by moving the step up.
        if (approval.timeoutAction && approval.timeoutAction !== 'escalate') {
            return approval;
        }

        if (new Date(approval.escalationDueAt) > now) {
            return approval;
        }

        // Spreading a Mongoose subdocument drops its fields (status, role, ...), so work on a plain copy.
        const escalatedApproval: any = {
            ...(typeof approval.toObject === 'function' ? approval.toObject() : approval),
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
