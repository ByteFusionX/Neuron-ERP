import PurchaseRequest from "../models/purchaseRequest.model";
import Workflow from "../models/workflow.model";
import Enquiry from "../models/enquiry.model";
import Category from "../models/category.model";
import Quotation from "../models/quotation.model";
import { buildAssignmentChain } from "./presaleAssignment.service";

/**
 * One-time conversion of workflows saved before the global layout (layoutVersion 2).
 * Old routes ran from the lowest order up; the new ones start at the bottom row and climb to Admin (order 1),
 * so every order is mirrored and the sequence people act in stays the same. Admin is pinned automatically,
 * so Super Admin roles are dropped from the steps. Safe to run on every start: converted workflows are skipped.
 */
export const migrateWorkflowsToGlobalLayout = async () => {
    try {
        // Quotations no longer have an approval step, so nothing may stay blocked waiting on one.
        await Quotation.updateMany({ 'approval.status': { $in: ['required', 'pending', 'rejected'] } }, { $set: { 'approval.status': 'not_required' } });

        const old = await Workflow.collection.find({ layoutVersion: { $exists: false } }).toArray();
        if (!old.length) return;

        const admins = await Category.find({ role: /^superadmin$/i }).select('_id').lean();
        const adminIds = new Set(admins.map((c: any) => c._id.toString()));

        for (const doc of old as any[]) {
            const kept = (doc.steps ?? []).filter((step: any) => !adminIds.has(step.role?.toString()));
            const orders = [...new Set<number>(kept.map((step: any) => Number(step.order)))].sort((a, b) => a - b);
            const mirrored = new Map(orders.map((order, rank) => [order, orders.length + 1 - rank]));

            const steps = kept.map((step: any) => {
                const { minAmount, ...rest } = step;
                return { ...rest, order: mirrored.get(Number(step.order)) };
            });

            const timed = steps.find((step: any) => step.escalationHours);
            await Workflow.collection.updateOne({ _id: doc._id }, {
                $set: {
                    steps,
                    skipRequesterRole: true,
                    businessHoursOnly: true,
                    workDayStart: '08:00',
                    workDayEnd: '17:00',
                    conditionFlags: { time: !!timed, amount: false, discount: false },
                    conditionDefaults: timed ? {
                        timeLimit: timed.escalationHours,
                        timeUnit: timed.escalationUnit || 'hour',
                        timeoutAction: timed.timeoutAction || 'escalate',
                        reminderPercent: timed.reminderPercent || 75,
                    } : {},
                    layoutVersion: 2,
                },
                $inc: { version: 1 },
            });

            if (doc.feature === 'presale') await restartWaitingPresaleJobs();
            console.log(`Workflow "${doc.feature}" converted to the global layout`);
        }
    } catch (error) {
        console.error('Workflow conversion failed:', error instanceof Error ? error.message : error);
    }
};

/** Jobs already waiting for an assignee were laddered in the old direction, so they start again on the new ladder. */
const restartWaitingPresaleJobs = async () => {
    const waiting = await Enquiry.find({
        isDeleted: { $ne: true },
        status: { $in: ['in presales', 'revision'] },
        'preSale.presalePerson': { $exists: false },
        'preSale.assignApproval': { $exists: true },
    }).select('preSale.assignApproval.restartCount');

    for (const enquiry of waiting) {
        const chain = await buildAssignmentChain();
        if (!chain) return;
        await Enquiry.updateOne(
            { _id: enquiry._id },
            { $set: { 'preSale.assignApproval': { ...chain, restartCount: (enquiry.preSale as any)?.assignApproval?.restartCount ?? 0 } } }
        );
    }
};

/**
 * Job purchase requests have no Draft status (a saved-but-unsubmitted one is In Progress), and no PR exists until the
 * buyer creates it: the empty New placeholders from the earlier design are removed (the job shows on the New tab instead).
 * General (job-less) purchases keep Drafted. Safe to run on every start: nothing is left to convert after the first.
 */
export const migrateJobDraftsToNew = async () => {
    try {
        const jobFilter = { sourceType: { $ne: 'manual' }, jobId: { $exists: true, $ne: null } };
        await PurchaseRequest.updateMany({ ...jobFilter, status: 'New', isDeleted: false, 'items.0': { $exists: false } }, { $set: { isDeleted: true } });
        await PurchaseRequest.updateMany({ ...jobFilter, status: { $in: ['Drafted', 'New'] } }, { $set: { status: 'In Progress' } });
    } catch (error) {
        console.error('Failed to migrate job purchase drafts:', error);
    }
};
