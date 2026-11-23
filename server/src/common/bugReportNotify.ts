import { notify } from "../services/notify.service";

export async function notifyEmployee(
    recipientId: string,
    payload: { type: string; referenceModel: string; title: string; message: string; sentBy: string; referenceId: any }
): Promise<void> {
    try {
        // notify() applies the recipient's muted notification types
        await notify({ ...payload, recipients: [recipientId] });
    } catch (error) {
        console.log("Failed to send bug report notification:", error);
    }
}
