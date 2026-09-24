import { Request, Response } from "express";
import SystemSetting, { SYSTEM_SETTING_KEYS, SystemSettingKey } from "../models/systemSetting.model";

interface NotificationEventSetting {
    enabled: boolean;
    email: boolean;
    // Days before a reminder fires. null for events that are not time-based.
    afterDays: number | null;
}

const NOTIFICATION_EVENTS = {
    approvalPending: { enabled: true, email: false, afterDays: 2 },
    missingData: { enabled: true, email: false, afterDays: null },
    duplicateWarning: { enabled: true, email: false, afterDays: null },
    overdueFollowUp: { enabled: true, email: false, afterDays: 1 },
} as const;

const AUDIT_AREAS = {
    documents: true,
    masterData: true,
    settings: true,
    usersRoles: true,
    approvals: true,
} as const;

const DEFAULTS: Record<SystemSettingKey, Record<string, any>> = {
    notifications: { events: NOTIFICATION_EVENTS },
    audit: { areas: AUDIT_AREAS, retentionDays: null },
};

const withDefaults = (key: SystemSettingKey, saved?: Record<string, any> | null): Record<string, any> => {
    if (key === 'notifications') {
        return {
            events: {
                ...NOTIFICATION_EVENTS,
                ...(saved?.events ?? {}),
            },
        };
    }
    if (key === 'audit') {
        return {
            areas: {
                ...AUDIT_AREAS,
                ...(saved?.areas ?? {}),
            },
            retentionDays: saved?.retentionDays ?? null,
        };
    }
    return { ...(DEFAULTS[key] as Record<string, any>), ...(saved ?? {}) };
};

const toDays = (v: unknown, min: number, max: number): number | null | undefined => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

// Returns the cleaned value, or an error message. Unknown keys are dropped.
const sanitizers: Record<SystemSettingKey, (body: any) => { value?: Record<string, any>; error?: string }> = {
    notifications: (body) => {
        const events: Record<string, NotificationEventSetting> = {};
        for (const [id, def] of Object.entries(NOTIFICATION_EVENTS)) {
            const input = body?.events?.[id] ?? {};
            let afterDays: number | null = null;
            if (def.afterDays !== null) {
                const d = toDays(input.afterDays, 1, 365);
                if (d === undefined || d === null) return { error: `Days for "${id}" must be a whole number from 1 to 365` };
                afterDays = d;
            }
            events[id] = { enabled: !!input.enabled, email: !!input.email, afterDays };
        }
        return { value: { events } };
    },
    audit: (body) => {
        const areas: Record<string, boolean> = {};
        for (const id of Object.keys(AUDIT_AREAS)) areas[id] = !!body?.areas?.[id];
        const retentionDays = toDays(body?.retentionDays, 30, 3650);
        if (retentionDays === undefined) return { error: "Retention must be a whole number of days from 30 to 3650, or empty to keep history forever" };
        return { value: { areas, retentionDays } };
    },
};

const isKey = (k: string): k is SystemSettingKey => (SYSTEM_SETTING_KEYS as readonly string[]).includes(k);

export const getSystemSetting = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        if (!isKey(key)) return res.status(400).json({ success: false, message: "Invalid setting" });
        const saved = await SystemSetting.findOne({ key }).lean();
        // Defaults fill anything not saved yet, including nested options added later.
        const data = withDefaults(key, saved?.value);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Error fetching setting:', error);
        return res.status(500).json({ success: false, message: "Failed to fetch setting" });
    }
};

export const saveSystemSetting = async (req: Request, res: Response) => {
    try {
        const { key } = req.params;
        if (!isKey(key)) return res.status(400).json({ success: false, message: "Invalid setting" });
        const { value, error } = sanitizers[key](req.body);
        if (error || !value) return res.status(400).json({ success: false, message: error });
        await SystemSetting.findOneAndUpdate({ key }, { key, value }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
        return res.status(200).json({ success: true, data: value });
    } catch (error) {
        console.error('Error saving setting:', error);
        return res.status(500).json({ success: false, message: "Failed to save setting" });
    }
};
