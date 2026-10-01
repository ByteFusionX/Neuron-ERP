import enquiryModel from '../models/enquiry.model';

/**
 * Follow-ups live in `followUpHistory` as tasks: `scheduled` (open, has `dueDate`), `done` (has outcome) or
 * `cancelled`. Entries without a status predate this and are treated as `done`. The enquiry's scalar
 * `nextFollowUpDate` mirrors the single open task so the list filters and dashboard keep working.
 */
export const FOLLOW_UP_OPEN = 'scheduled';

/** Closes the enquiry's open follow-up (and clears the scalar next date), e.g. when it is lost or quoted. */
export const cancelOpenFollowUp = async (enquiryId: any, reason: string) => {
    const now = new Date();
    await enquiryModel.updateOne(
        { _id: enquiryId, 'followUpHistory.status': FOLLOW_UP_OPEN },
        {
            $set: {
                'followUpHistory.$[open].status': 'cancelled',
                'followUpHistory.$[open].cancelReason': reason,
                'followUpHistory.$[open].completedAt': now,
            },
        },
        { arrayFilters: [{ 'open.status': FOLLOW_UP_OPEN }] }
    );
    await enquiryModel.updateOne({ _id: enquiryId, nextFollowUpDate: { $exists: true } }, { $unset: { nextFollowUpDate: '' } });
};
