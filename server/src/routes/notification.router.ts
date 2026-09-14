import { Router } from "express";
import { createNotification, getAllNotifications, markAsRead, markAsReadByTypes } from "../controllers/notification.controller";

const notificationRouter = Router();

notificationRouter.get('/', getAllNotifications);
notificationRouter.patch('/mark-as-read', markAsRead);
notificationRouter.patch('/mark-as-read-by-types', markAsReadByTypes);

export default notificationRouter;
