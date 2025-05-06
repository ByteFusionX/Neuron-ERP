import { Router } from "express";
import { createNotification, getAllNotifications, markAsRead } from "../controllers/notification.controller";

const notificationRouter = Router();

notificationRouter.get('/:token', getAllNotifications);
notificationRouter.patch('/mark-as-read', markAsRead);

export default notificationRouter;
