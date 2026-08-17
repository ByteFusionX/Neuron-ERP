import { Request, Response, NextFunction } from "express";
import PushSubscription from "../models/pushSubscription.model";
import { getEmployeeData } from "../common/utils/util";

export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { endpoint, keys, userAgent } = req.body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ success: false, message: 'endpoint and keys.p256dh/keys.auth are required' });
        }

        const userData = await getEmployeeData(req.user);

        const subscription = await PushSubscription.findOneAndUpdate(
            { endpoint },
            {
                endpoint,
                employee: userData._id,
                keys: { p256dh: keys.p256dh, auth: keys.auth },
                userAgent,
            },
            { new: true, upsert: true }
        );

        return res.status(200).json({ success: true, subscription });
    } catch (error) {
        next(error);
    }
};

export const unsubscribe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ success: false, message: 'endpoint is required' });
        }

        const userData = await getEmployeeData(req.user);

        const result = await PushSubscription.findOneAndDelete({ endpoint, employee: userData._id });

        if (!result) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};
