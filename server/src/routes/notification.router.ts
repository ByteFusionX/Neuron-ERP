import { Router } from "express";
import { dismissNotification, getAllNotifications, getNotificationPreferences, markAllAsRead, markAsRead, markAsReadByTypes, updateNotificationPreferences } from "../controllers/notification.controller";

const notificationRouter = Router();

notificationRouter.get('/preferences', getNotificationPreferences);
notificationRouter.put('/preferences', updateNotificationPreferences);
notificationRouter.get('/', getAllNotifications);
notificationRouter.patch('/mark-as-read', markAsRead);
notificationRouter.patch('/mark-as-read-by-types', markAsReadByTypes);
notificationRouter.patch('/mark-all-as-read', markAllAsRead);
notificationRouter.patch('/dismiss', dismissNotification);

export default notificationRouter;
