import Workflow from "../models/workflow.model";

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);

const getPresaleWorkflowSteps = async () => {
    const workflow = await Workflow.findOne({ feature: 'presale' }).populate('steps.role');
    if (!workflow || !workflow.steps.length) return null;
    return [...workflow.steps].sort((a, b) => a.order - b.order);
};

/**
 * Builds the initial assignment-escalation state for a job entering presale.
 * The workflow's ordered steps ARE the escalation ladder: whoever is configured at
 * order 1 can assign first, and if their escalationHours elapse without action the
 * responsibility (and freeze) moves to the next step, and so on. The last configured
 * step never escalates further, so it acts as that workflow's default top-level
 * fallback (e.g. admin) - purely by being the last entry an admin configured, not by
 * any hardcoded role.
 */
export const buildAssignmentChain = async () => {
    const steps = await getPresaleWorkflowSteps();
    if (!steps) return null;

    const now = new Date();
    return {
        stepIndex: 0,
        role: steps[0].role,
        assignedAt: now,
        escalationDueAt: addHours(now, steps[0].escalationHours || 48),
    };
};

/**
 * Advances an assignment chain past any steps whose escalation window has already
 * elapsed, mirroring the lazy/on-access pattern used for approval workflows elsewhere
 * (escalateApprovalStatus) rather than a proactive scheduler. Returns the same object
 * (by reference) when nothing changed, or a new object with the escalated state.
 */
export const resolveCurrentAssignmentStep = async (assignment: any, now = new Date()) => {
    if (!assignment) return null;

    const steps = await getPresaleWorkflowSteps();
    if (!steps) return assignment;

    let stepIndex = assignment.stepIndex ?? 0;
    let assignedAt = assignment.assignedAt;
    let escalationDueAt = assignment.escalationDueAt;
    let escalatedFrom = assignment.escalatedFrom;
    let escalated = false;

    while (
        stepIndex < steps.length - 1 &&
        escalationDueAt &&
        new Date(escalationDueAt) <= now
    ) {
        escalatedFrom = steps[stepIndex].role;
        stepIndex += 1;
        assignedAt = escalationDueAt;
        escalationDueAt = addHours(new Date(assignedAt), steps[stepIndex].escalationHours || 48);
        escalated = true;
    }

    if (!escalated) return assignment;

    return {
        stepIndex,
        role: steps[stepIndex].role,
        assignedAt,
        escalationDueAt,
        escalatedFrom,
    };
};
