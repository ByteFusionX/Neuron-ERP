import { Router } from "express";
import { getAllNotifications, getNotificationPreferences, markAsRead, markAsReadByTypes, updateNotificationPreferences } from "../controllers/notification.controller";

const notificationRouter = Router();

notificationRouter.get('/preferences', getNotificationPreferences);
notificationRouter.put('/preferences', updateNotificationPreferences);
notificationRouter.get('/', getAllNotifications);
notificationRouter.patch('/mark-as-read', markAsRead);
notificationRouter.patch('/mark-as-read-by-types', markAsReadByTypes);

export default notificationRouter;
