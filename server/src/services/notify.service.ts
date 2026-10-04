import { Server } from "socket.io";
import Employee from "../models/employee.model";
import Notification from "../models/notification.model";
import NotificationOutbox from "../models/notificationOutbox.model";
import NotificationPreference, { NotificationChannel } from "../models/notificationPreference.model";
import { createNotification, filterEmployeesByPrivilege, getRoutePath, PrivilegeFilter } from "../controllers/notification.controller";
import { sendWebPushToEmployees } from "./webPush.service";
import { registerScheduledHandler, scheduleJob } from "./outbox.service";
import { isAppMailConfigured } from "./email.service";

export interface NotifyOptions {
    type: string;
    referenceModel: string;
    title: string;
    message: string;
    /** Employee ids (strings or ObjectIds). */
    recipients: any[];
    sentBy?: any;
    referenceId: any;
    additionalData?: Record<string, unknown>;
    /** Makes the send idempotent: the same key never notifies twice, whichever cron, instance or retry runs it. */
    dedupeKey?: string;
    /** Defaults to in-app (+ live socket push) and web push. Add 'email' to also mail the recipients. */
    channels?: NotificationChannel[];
    /** Emails of this priority are batched into one digest per recipient. */
    emailPriority?: 'immediate' | 'digest';
    /** Deliver later instead of now. */
    sendAt?: Date;
}

const DEFAULT_CHANNELS: NotificationChannel[] = ['inapp', 'push'];
const SCHEDULED_HANDLER = 'notify';

const toIds = (recipients: any[]) => [...new Set(recipients.filter(Boolean).map(recipient => recipient.toString()))];

/**
 * The single entry point for sending a notification. Callers say what happened and to whom; this decides
 * the delivery: a stored in-app notification with a live socket push, web push, and queued email, each
 * respecting the recipient's preferences. Returns the stored notification, or null when it was a duplicate,
 * scheduled for later, or no one was eligible.
 */
export const notify = async (options: NotifyOptions) => {
    const ids = toIds(options.recipients);
    if (!ids.length) return null;

    if (options.sendAt && options.sendAt.getTime() > Date.now()) {
        const { sendAt, ...payload } = options;
        await scheduleJob(SCHEDULED_HANDLER, { ...payload, recipients: ids, sendAt: undefined }, sendAt, options.dedupeKey ? `scheduled:${options.dedupeKey}` : undefined);
        return null;
    }

    const { dedupeKey } = options;
    if (dedupeKey && await Notification.exists({ dedupeKey })) return null;

    const channels = options.channels?.length ? options.channels : DEFAULT_CHANNELS;
    const preferences = await NotificationPreference.find({ employee: { $in: ids } }).lean();
    const preferenceOf = new Map(preferences.map(preference => [preference.employee.toString(), preference]));
    const allowed = (channel: NotificationChannel) =>
        channels.includes(channel) ? ids.filter(id => !preferenceOf.get(id)?.muted?.[channel]?.includes(options.type)) : [];

    const inappIds = allowed('inapp');
    let notification: any = null;
    if (inappIds.length) {
        try {
            notification = await createNotification({
                type: options.type,
                referenceModel: options.referenceModel,
                title: options.title,
                message: options.message,
                date: new Date(),
                sentBy: options.sentBy?.toString(),
                recipients: inappIds.map(objectId => ({ objectId, status: 'unread' })),
                referenceId: options.referenceId,
                additionalData: options.additionalData ?? {},
                dedupeKey,
            });
        } catch (error: any) {
            // Another worker created the same notification between the check above and the insert
            if (error?.code === 11000) return null;
            throw error;
        }

        const socket = (global as any).io as Server | undefined;
        notification?.recipients.forEach((recipient: any) => {
            socket?.to((recipient.objectId._id ?? recipient.objectId).toString()).emit('recieveNotifications', notification);
        });
    }

    const pushIds = allowed('push');
    if (pushIds.length) {
        const route = getRoutePath(options.type, options.referenceId, options.additionalData);
        void sendWebPushToEmployees(pushIds, { title: options.title, body: options.message, data: { routePath: route.routePath, routeData: route.routeData } });
    }

    const emailIds = allowed('email');
    if (emailIds.length) await queueEmails(options, emailIds, preferenceOf);

    return notification;
};

/**
 * notify() for recipients chosen by privilege. The person who did the thing (`sentBy`) is never a recipient:
 * notifications are for work waiting on someone, and the actor already has the on-screen confirmation.
 */
export const notifyByPrivilege = async (options: Omit<NotifyOptions, 'recipients'>, filter: PrivilegeFilter) => {
    const recipients = await filterEmployeesByPrivilege(filter, options.sentBy?.toString());
    return notify({ ...options, recipients });
};

const queueEmails = async (options: NotifyOptions, employeeIds: string[], preferenceOf: Map<string, any>) => {
    // Without a configured sender mailbox there is nothing to deliver with; in-app and push still go out
    if (!isAppMailConfigured()) return;
    const employees = await Employee.find({ _id: { $in: employeeIds }, isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('email').lean();
    for (const employee of employees) {
        if (!employee.email) continue;
        const id = employee._id.toString();
        const digest = options.emailPriority === 'digest' || preferenceOf.get(id)?.emailDigest?.includes(options.type);
        try {
            await NotificationOutbox.create({
                kind: 'email',
                employee: employee._id,
                to: employee.email,
                subject: options.title,
                message: options.message,
                priority: digest ? 'digest' : 'immediate',
                dedupeKey: options.dedupeKey ? `${options.dedupeKey}:email:${id}` : undefined,
            });
        } catch (error: any) {
            if (error?.code !== 11000) console.error('Error queueing notification email:', error.message);
        }
    }
};

// A scheduled notification runs through the same path when its time comes
registerScheduledHandler(SCHEDULED_HANDLER, async (payload: NotifyOptions) => { await notify(payload); });
