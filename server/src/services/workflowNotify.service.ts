import Job from "../models/job.model";
import Quotation from "../models/quotation.model";
import { filterEmployeesByPrivilege } from "../controllers/notification.controller";

/** Views that only reach records the person created or reports on; everything else sees all records. */
const SCOPED_VIEWS = ['created', 'reported', 'createdAndReported'];

/** The salesperson who owns a job: the creator of the quotation it was raised from. */
export const jobOwnerOf = async (jobId: any): Promise<string | null> => {
    if (!jobId) return null;
    const job: any = await Job.findById(jobId._id ?? jobId).select('quoteId').lean();
    if (!job?.quoteId) return null;
    const quote: any = await Quotation.findById(job.quoteId).select('createdBy').lean();
    return quote?.createdBy ? String(quote.createdBy) : null;
};

/**
 * Billing staff to tell about a record: everyone who can view invoices. Someone whose view is limited to
 * their own (or their reports') records only hears about records they own, so `owners` are the record's owners.
 */
export const billingRecipients = (owners: any[] = []): Promise<string[]> => {
    const ownerIds = new Set(owners.filter(Boolean).map(String));
    return filterEmployeesByPrivilege({
        privilegeKey: 'invoice',
        checkFunction: (privileges, employeeId) => {
            const view = privileges.invoice?.viewReport;
            if (!view || view === 'none') return false;
            return !SCOPED_VIEWS.includes(view) || (!!employeeId && ownerIds.has(employeeId));
        },
    });
};

/** Employees who can view the given module (for example the receiving team of a GRN). */
export const viewersOf = (privilegeKey: 'grn' | 'dispatch' | 'purchaseOrder' | 'invoice'): Promise<string[]> =>
    filterEmployeesByPrivilege({
        privilegeKey,
        checkFunction: (privileges) => {
            const view = (privileges as any)[privilegeKey]?.viewReport;
            return !!view && view !== 'none';
        },
    });

/**
 * Keeps only the people who are allowed to open the module the notification points at. Used for recipients picked
 * by relationship (job owner, record creator): being involved is not enough if their role can no longer see it.
 */
export const onlyViewers = async (ids: any[], privilegeKey: 'grn' | 'dispatch' | 'purchaseOrder' | 'invoice'): Promise<string[]> => {
    const wanted = ids.flat().filter(Boolean).map(String);
    if (!wanted.length) return [];
    const viewers = new Set(await viewersOf(privilegeKey));
    return wanted.filter(id => viewers.has(id));
};

/** De-duplicated recipient ids, without the person who did the thing (they already have the on-screen confirmation). */
export const recipientsExcluding = (ids: any[], actor?: any): string[] => {
    const skip = actor ? String(actor._id ?? actor) : '';
    return [...new Set(ids.flat().filter(Boolean).map(String))].filter(id => id !== skip);
};

/** Runs a notification step so that a failure to notify never fails the action that was already saved. */
export const safely = async (label: string, work: () => Promise<unknown>): Promise<void> => {
    try {
        await work();
    } catch (error: any) {
        console.error(`Notification (${label}) failed:`, error?.message ?? error);
    }
};
