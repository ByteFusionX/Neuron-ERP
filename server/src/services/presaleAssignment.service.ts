import Workflow from "../models/workflow.model";
import Enquiry from "../models/enquiry.model";
import Category from "../models/category.model";
import { dueAfterWorkingTime } from "./workflow.service";

const DEFAULT_REMINDER_PERCENT = 75;
/** Working minutes Admin gets before the daily "still unassigned" alerts start. */
const ADMIN_WINDOW_MINUTES = 8 * 60;
const UNIT_MINUTES: Record<string, number> = { minute: 1, hour: 60, day: 24 * 60 };

/**
 * The assignment ladder: the bottom row of the workflow acts first and the job climbs towards
 * order 1. Admin is pinned on top automatically, so the ladder always ends with someone who can decide.
 */
export type AssignmentKind = 'presale' | 'procurement';

/** Which workflow feature drives each ladder, and which privilege lets a role act on it. */
const canActOn = (kind: AssignmentKind, role: any) => kind === 'procurement'
    ? role?.privileges?.purchase?.canAssign === true
    : role?.privileges?.assignedJob?.assign === true;

const getPresaleWorkflow = async (disabledRoles: any[] = [], kind: AssignmentKind = 'presale') => {
    const skipped = new Set(disabledRoles.map(id => String((id as any)?._id ?? id)));
    const workflow = await Workflow.findOne({ feature: kind === 'procurement' ? 'procurementAssignment' : 'presale' }).populate('steps.role');
    if (!workflow) return null;

    // A role that lost the assign privilege can no longer act, so its step is skipped until the privilege returns.
    const live: any[] = [...workflow.steps]
        .filter(step => step.enabled !== false)
        .filter(step => canActOn(kind, step.role))
        .filter(step => !skipped.has(String((step.role as any)?._id ?? step.role)))
        .sort((a, b) => b.order - a.order);

    // Rows sharing an order are an "Or" stage: any of those roles may assign, and they share one time window
    // (the longest of theirs, so no member is escalated past before their own limit has run).
    const windowOf = (step: any) => (step.escalationHours || 0) * (UNIT_MINUTES[step.escalationUnit] ?? 60);
    const grouped = new Map<number, any[]>();
    for (const step of live) grouped.set(step.order, [...(grouped.get(step.order) ?? []), step]);
    const steps: any[] = [...grouped.values()].map(members => {
        const lead = members.reduce((best, step) => (windowOf(step) > windowOf(best) ? step : best), members[0]);
        return {
            order: lead.order,
            role: lead.role,
            roles: members.map(step => step.role),
            escalationHours: lead.escalationHours,
            escalationUnit: lead.escalationUnit,
            timeoutAction: lead.timeoutAction,
            reminderPercent: lead.reminderPercent,
            reminderEnabled: lead.reminderEnabled,
        };
    });

    const admin = await Category.findOne({ role: /^superadmin$/i }).select('_id categoryName').lean();
    // Only one Super Admin on the ladder: skip the pinned row if any stored step already holds a super admin role.
    const hasSuperAdmin = live.some(step => /^superadmin$/i.test((step.role as any)?.role ?? '') || ((step.role as any)?._id ?? step.role)?.toString() === admin?._id.toString());
    if (admin && !hasSuperAdmin) {
        steps.push({ role: admin, roles: [admin], order: 1, admin: true, timed: steps.some(step => step.escalationHours) });
    }
    if (!steps.length) return null;
    return { workflow, steps };
};

/** Every role that may assign at this stage (an "Or" stage has several). */
export const stageRoleIds = (assignment: any): string[] => {
    const roles = assignment?.roles?.length ? assignment.roles : [assignment?.role];
    return roles.filter(Boolean).map((role: any) => String(role?._id ?? role));
};

/** Timing state for a step that starts at `start`: when it escalates and when its reminder goes out (default 75% of the window). */
const stepWindow = (workflow: any, step: any, start: Date) => {
    const timed = step.admin ? !!step.timed : !!step.escalationHours;
    const repeatReminder = workflow.repeatReminder !== false;
    const idle = { assignedAt: start, escalationDueAt: null, reminderDueAt: null, reminderSentAt: null, timeoutHandledAt: null, timeoutAction: 'escalate', repeatReminder };
    if (!timed) return idle;

    // Admin has no limits of their own: they get one working day before the daily alerts begin.
    if (step.admin) return { ...idle, escalationDueAt: dueAfterWorkingTime(workflow, start, ADMIN_WINDOW_MINUTES) };

    const unit = UNIT_MINUTES[step.escalationUnit] ? step.escalationUnit : 'hour';
    const minutes = step.escalationHours * UNIT_MINUTES[unit];
    const percent = step.reminderPercent || DEFAULT_REMINDER_PERCENT;
    return {
        ...idle,
        escalationDueAt: dueAfterWorkingTime(workflow, start, minutes),
        reminderDueAt: step.reminderEnabled === false ? null : dueAfterWorkingTime(workflow, start, minutes * percent / 100),
        timeoutAction: ['notify', 'reject'].includes(step.timeoutAction) ? step.timeoutAction : 'escalate',
    };
};

/**
 * Builds the initial assignment-escalation state for a job entering presale.
 * The workflow's steps ARE the escalation ladder: whoever is on the bottom row
 * can assign first. When their time limit passes, the step's timeout action
 * decides what happens (escalate to the next step, notify only, or auto-reject). The
 * last configured step never escalates further, so it acts as the default top-level
 * fallback purely by being the last entry an admin configured.
 */
export const buildAssignmentChain = async (disabledRoles: any[] = [], kind: AssignmentKind = 'presale') => {
    const found = await getPresaleWorkflow(disabledRoles, kind);
    if (!found) return null;

    return {
        stepIndex: 0,
        disabledRoles,
        role: found.steps[0].role,
        roles: found.steps[0].roles,
        workflowVersion: found.workflow.version ?? 1,
        ...stepWindow(found.workflow, found.steps[0], new Date()),
    };
};

/**
 * Advances an assignment chain past any steps whose time limit has already elapsed,
 * mirroring the lazy/on-access pattern used for approval workflows elsewhere
 * (escalateApprovalStatus) rather than a proactive scheduler. Only steps whose timeout
 * action is 'escalate' move up; 'notify' and 'reject' steps hold the job where it is
 * (the cron notifies or auto-rejects, and a Super Admin can escalate or reject a held job). Returns the same object (by reference) when nothing
 * changed, or a new object with the escalated state.
 */
export const resolveCurrentAssignmentStep = async (assignment: any, now = new Date(), kind: AssignmentKind = 'presale') => {
    if (!assignment) return null;

    const found = await getPresaleWorkflow(assignment.disabledRoles ?? [], kind);
    if (!found) return assignment;
    const { workflow, steps } = found;

    let stepIndex = assignment.stepIndex ?? 0;
    let window: any = null;
    let escalatedFrom = assignment.escalatedFrom;
    let dueAt = assignment.escalationDueAt;

    while (
        stepIndex < steps.length - 1 &&
        dueAt &&
        (steps[stepIndex].timeoutAction || 'escalate') === 'escalate' &&
        new Date(dueAt) <= now
    ) {
        escalatedFrom = steps[stepIndex].role;
        const start = new Date(dueAt);
        stepIndex += 1;
        window = stepWindow(workflow, steps[stepIndex], start);
        dueAt = window.escalationDueAt;
    }

    if (!window) return assignment;

    return {
        stepIndex,
        role: steps[stepIndex].role,
        roles: steps[stepIndex].roles,
        workflowVersion: assignment.workflowVersion ?? workflow.version ?? 1,
        escalatedFrom,
        restartCount: assignment.restartCount,
        disabledRoles: assignment.disabledRoles ?? [],
        ...window,
    };
};

/**
 * Moves a job held at a 'notify' (or any) step up to the next step right now, starting that step's own
 * window from `now`. Used when a Super Admin escalates a held job. Returns null at the last step.
 */
export const advanceAssignmentStep = async (assignment: any, now = new Date(), kind: AssignmentKind = 'presale') => {
    if (!assignment) return null;
    const found = await getPresaleWorkflow(assignment.disabledRoles ?? [], kind);
    if (!found) return null;
    const { workflow, steps } = found;
    const current = assignment.stepIndex ?? 0;
    if (current >= steps.length - 1) return null;
    const stepIndex = current + 1;
    return {
        stepIndex,
        role: steps[stepIndex].role,
        roles: steps[stepIndex].roles,
        workflowVersion: assignment.workflowVersion ?? workflow.version ?? 1,
        escalatedFrom: assignment.role,
        restartCount: assignment.restartCount,
        disabledRoles: assignment.disabledRoles ?? [],
        ...stepWindow(workflow, steps[stepIndex], now),
    };
};

/** Rejects a job nobody picked up in time: it goes back to sales with the reason, and leaves the assignment workflow. */
export const rejectUnassignedPresale = async (enquiryId: any, reason: string, rejectedRole: string) => {
    await Enquiry.updateOne(
        { _id: enquiryId },
        {
            $set: { status: 'rejected', 'preSale.status': 'returned', 'preSale.seenbySalesPerson': false, 'preSale.seenbyEmployee': false, 'preSale.newFeedbackAccess': true },
            $push: { 'preSale.rejectionHistory': { rejectionReason: reason, rejectedRole, rejectedAt: new Date() } },
            $unset: { 'preSale.assignApproval': '' }
        }
    );
};

/** True once the chain sits on the last step and that step's window has run out: nobody below acted, so it is the Super Admin's call. */
export const assignmentHeldChecker = async (kind: AssignmentKind) => {
    const found = await getPresaleWorkflow([], kind);
    const last = (found?.steps.length ?? 0) - 1;
    return (assignment: any, now = new Date()) =>
        !!assignment && last >= 0 && (assignment.stepIndex ?? 0) >= last && !!assignment.escalationDueAt && new Date(assignment.escalationDueAt) <= now;
};
