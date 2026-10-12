import { Schema, model } from "mongoose";

interface DashboardPreference {
    employee: any;
    // Which dashboard these settings belong to (only 'sales' for now)
    dashboard: string;
    // Section keys in display order, and the ones the employee has hidden
    order: string[];
    hidden: string[];
    // KPI tile keys the employee has hidden from the strip
    hiddenKpis: string[];
    // Opening view: period preset, currency, and optional narrowing
    defaults: { period?: string | null; currency?: string | null; person?: string | null; customer?: string | null };
}

const dashboardPreferenceSchema = new Schema<DashboardPreference>({
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    dashboard: { type: String, required: true },
    order: { type: [String], default: [] },
    hidden: { type: [String], default: [] },
    hiddenKpis: { type: [String], default: [] },
    defaults: {
        period: { type: String, default: null },
        currency: { type: String, default: null },
        person: { type: String, default: null },
        customer: { type: String, default: null },
    },
}, { timestamps: true });

dashboardPreferenceSchema.index({ employee: 1, dashboard: 1 }, { unique: true });

export default model<DashboardPreference>('DashboardPreference', dashboardPreferenceSchema);
