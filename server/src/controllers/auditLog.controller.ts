import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import auditLogModel from "../models/auditLog.model";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** History of one record, newest first. */
export const getEntityAudit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;
    if (!Types.ObjectId.isValid(entityId)) return res.status(400).json({ success: false, message: "Invalid id" });
    const entries = await auditLogModel.find({ entityType, entityId }).sort({ at: -1 }).limit(500).lean();
    return res.status(200).json(entries);
  } catch (error) {
    next(error);
  }
};

/** Cross-module log for the Settings page: filterable, paginated, newest first. */
export const listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const { entityType, action, actor, search, from, to } = req.query as Record<string, string | undefined>;

    const filter: Record<string, any> = {};
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;
    if (actor) filter.actorName = { $regex: escapeRegex(actor.trim()), $options: "i" };
    if (search) filter.summary = { $regex: escapeRegex(search.trim()), $options: "i" };
    if (from || to) {
      filter.at = {};
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (fromDate && !isNaN(fromDate.getTime())) filter.at.$gte = fromDate;
      if (toDate && !isNaN(toDate.getTime())) {
        // A bare date means the whole of that day.
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) toDate.setUTCHours(23, 59, 59, 999);
        filter.at.$lte = toDate;
      }
      if (!Object.keys(filter.at).length) delete filter.at;
    }

    const [data, total, entityTypes] = await Promise.all([
      auditLogModel.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      auditLogModel.countDocuments(filter),
      auditLogModel.distinct("entityType"),
    ]);

    return res.status(200).json({ data, total, page, limit, entityTypes });
  } catch (error) {
    next(error);
  }
};
