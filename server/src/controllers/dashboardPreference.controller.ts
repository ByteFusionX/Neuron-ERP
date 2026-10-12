import { Request, Response, NextFunction } from "express";
import { getEmployeeData } from "../common/utils/util";
import DashboardPreference from "../models/dashboardPreference.model";

// Allowed keys per dashboard, so stored settings can't grow arbitrary junk.
const DASHBOARDS: Record<string, { sections: string[]; kpis: string[]; periods: string[]; currencies: string[] }> = {
    sales: {
        sections: ['kpis', 'funnel', 'attention', 'trend', 'people', 'aging', 'customers', 'lost', 'margin', 'sizes', 'sources'],
        kpis: ['enq', 'sent', 'rate', 'pipe', 'avg', 'tat'],
        periods: ['month', 'lastMonth', 'quarter', 'ytd', '12m'],
        currencies: ['QAR', 'USD'],
    },
};

const shape = (pref: any) => ({
    order: pref?.order || [],
    hidden: pref?.hidden || [],
    hiddenKpis: pref?.hiddenKpis || [],
    defaults: {
        period: pref?.defaults?.period || null,
        currency: pref?.defaults?.currency || null,
        person: pref?.defaults?.person || null,
        customer: pref?.defaults?.customer || null,
    },
});

/** The signed-in employee's layout and opening view for one dashboard (empty when never customised). */
export const getDashboardPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dashboard = req.params.dashboard;
        if (!DASHBOARDS[dashboard]) return res.status(404).json({ message: 'Unknown dashboard' });
        const user = await getEmployeeData(req.user);
        const pref = await DashboardPreference.findOne({ employee: user._id, dashboard }).lean();
        res.status(200).json(shape(pref));
    } catch (error) {
        next(error);
    }
};

export const updateDashboardPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dashboard = req.params.dashboard;
        const allowed = DASHBOARDS[dashboard];
        if (!allowed) return res.status(404).json({ message: 'Unknown dashboard' });
        const user = await getEmployeeData(req.user);

        const pick = (list: any, valid: string[]) => Array.isArray(list) ? [...new Set<string>(list.filter((k: any) => valid.includes(k)))] : [];
        const one = (v: any, valid?: string[]) => typeof v === 'string' && v && (!valid || valid.includes(v)) ? v.slice(0, 64) : null;
        const d = req.body?.defaults || {};

        // Person/customer ids are only a starting filter; the dashboard endpoint still scopes what the viewer may see.
        const pref = await DashboardPreference.findOneAndUpdate(
            { employee: user._id, dashboard },
            {
                $set: {
                    order: pick(req.body?.order, allowed.sections),
                    hidden: pick(req.body?.hidden, allowed.sections),
                    hiddenKpis: pick(req.body?.hiddenKpis, allowed.kpis),
                    defaults: {
                        period: one(d.period, allowed.periods),
                        currency: one(d.currency, allowed.currencies),
                        person: one(d.person),
                        customer: one(d.customer),
                    },
                },
            },
            { upsert: true, new: true }
        ).lean();
        res.status(200).json(shape(pref));
    } catch (error) {
        next(error);
    }
};

export const resetDashboardPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dashboard = req.params.dashboard;
        if (!DASHBOARDS[dashboard]) return res.status(404).json({ message: 'Unknown dashboard' });
        const user = await getEmployeeData(req.user);
        await DashboardPreference.deleteOne({ employee: user._id, dashboard });
        res.status(200).json(shape(null));
    } catch (error) {
        next(error);
    }
};
