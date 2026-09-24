import { model, Schema } from "mongoose";

export const SYSTEM_SETTING_KEYS = ['notifications', 'audit'] as const;
export type SystemSettingKey = typeof SYSTEM_SETTING_KEYS[number];

interface SystemSetting {
    key: SystemSettingKey;
    value: Record<string, any>;
}

// One document per settings section. The shape of `value` is defined and validated
// in systemSetting.controller.ts, so a new section needs no new collection.
const systemSettingSchema = new Schema<SystemSetting>({
    key: { type: String, enum: SYSTEM_SETTING_KEYS, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default model<SystemSetting>('SystemSetting', systemSettingSchema);
