import { Server } from "socket.io";
import { createNotification } from "../controllers/notification.controller";
import { sendWebPushToEmployees } from "../services/webPush.service";

export async function notifyEmployee(
    recipientId: string,
    payload: { type: string; referenceModel: string; title: string; message: string; sentBy: string; referenceId: any }
): Promise<void> {
    try {
        const notification = await createNotification({
            ...payload,
            recipients: [{ objectId: recipientId, status: 'unread' }],
            date: new Date(),
        });

        const socket = global.io as Server | undefined;
        if (notification && socket) {
            socket.to(recipientId).emit("recieveNotifications", notification);
        }

        void sendWebPushToEmployees([recipientId], {
            title: payload.title,
            body: payload.message,
            data: { routePath: '/bug-reports' },
        });
    } catch (error) {
        console.log("Failed to send bug report notification:", error);
    }
}
