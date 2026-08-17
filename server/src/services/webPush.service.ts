import webpush from 'web-push';
import dotenv from 'dotenv';
import PushSubscription from '../models/pushSubscription.model';

dotenv.config();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@neuron.com.qa';

let isConfigured = !!vapidPublicKey && !!vapidPrivateKey;

if (isConfigured) {
    try {
        webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
    } catch (error) {
        console.error('Invalid VAPID configuration, web push disabled:', error);
        isConfigured = false;
    }
}

export interface WebPushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: Record<string, unknown>;
}

export const sendWebPushToEmployees = async (employeeIds: string[], payload: WebPushPayload): Promise<void> => {
    if (!isConfigured || employeeIds.length === 0) {
        return;
    }

    try {
        const subscriptions = await PushSubscription.find({ employee: { $in: employeeIds } });

        await Promise.all(subscriptions.map(async (subscription) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.keys.p256dh,
                            auth: subscription.keys.auth,
                        },
                    },
                    JSON.stringify(payload)
                );
            } catch (error: any) {
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    await PushSubscription.deleteOne({ _id: subscription._id });
                } else {
                    console.error('Error sending web push notification:', error);
                }
            }
        }));
    } catch (error) {
        console.error('Error sending web push notifications:', error);
    }
};
