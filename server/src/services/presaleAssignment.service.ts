import Workflow from "../models/workflow.model";
import Enquiry from "../models/enquiry.model";
import { addBusinessHours } from "./workflow.service";

const DEFAULT_ESCALATION_HOURS = 48;
const DEFAULT_REMINDER_PERCENT = 75;
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];
const UNIT_MINUTES: Record<string, number> = { minute: 1, hour: 60, day: 24 * 60 };

const getPresaleWorkflow = async () => {
    const workflow = await Workflow.findOne({ feature: 'presale' }).populate('steps.role');
    if (!workflow || !workflow.steps.length) return null;
    return { workflow, steps: [...workflow.steps].sort((a, b) => a.order - b.order) };
};

/** Adds minutes on the workflow's clock: calendar time, or working-day hours when set to business days only (minute limits always use the calendar clock). */
const dueAfter = (workflow: any, start: Date, minutes: number, unit: string) => workflow.businessHoursOnly && unit !== 'minute'
    ? addBusinessHours(start, minutes / 60, workflow.workingDays?.length ? workflow.workingDays : DEFAULT_WORKING_DAYS)
    : new Date(start.getTime() + minutes * 60 * 1000);

/** Timing state for a step that starts at `start`: when it escalates and when its reminder goes out (default 75% of the window). */
const stepWindow = (workflow: any, step: any, start: Date) => {
    const unit = UNIT_MINUTES[step.escalationUnit] ? step.escalationUnit : 'hour';
    const minutes = (step.escalationHours || DEFAULT_ESCALATION_HOURS) * UNIT_MINUTES[unit];
    const percent = step.reminderPercent || DEFAULT_REMINDER_PERCENT;
    return {
        assignedAt: start,
        escalationDueAt: dueAfter(workflow, start, minutes, unit),
        reminderDueAt: step.reminderEnabled === false ? null : dueAfter(workflow, start, minutes * percent / 100, unit),
        reminderSentAt: null,
        timeoutHandledAt: null,
        timeoutAction: ['notify', 'reject'].includes(step.timeoutAction) ? step.timeoutAction : 'escalate',
        repeatReminder: workflow.repeatReminder !== false,
    };
};

/**
 * Builds the initial assignment-escalation state for a job entering presale.
 * The workflow's ordered steps ARE the escalation ladder: whoever is configured at
 * order 1 can assign first. When their time limit passes, the step's timeout action
 * decides what happens (escalate to the next step, notify only, or auto-reject). The
 * last configured step never escalates further, so it acts as the default top-level
 * fallback purely by being the last entry an admin configured.
 */
export const buildAssignmentChain = async () => {
    const found = await getPresaleWorkflow();
    if (!found) return null;

    return {
        stepIndex: 0,
        role: found.steps[0].role,
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
export const resolveCurrentAssignmentStep = async (assignment: any, now = new Date()) => {
    if (!assignment) return null;

    const found = await getPresaleWorkflow();
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
        workflowVersion: assignment.workflowVersion ?? workflow.version ?? 1,
        escalatedFrom,
        ...window,
    };
};

/**
 * Moves a job held at a 'notify' (or any) step up to the next step right now, starting that step's own
 * window from `now`. Used when a Super Admin escalates a held job. Returns null at the last step.
 */
export const advanceAssignmentStep = async (assignment: any, now = new Date()) => {
    const found = await getPresaleWorkflow();
    if (!found || !assignment) return null;
    const { workflow, steps } = found;
    const current = assignment.stepIndex ?? 0;
    if (current >= steps.length - 1) return null;
    const stepIndex = current + 1;
    return {
        stepIndex,
        role: steps[stepIndex].role,
        workflowVersion: assignment.workflowVersion ?? workflow.version ?? 1,
        escalatedFrom: assignment.role,
        restartCount: assignment.restartCount,
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
