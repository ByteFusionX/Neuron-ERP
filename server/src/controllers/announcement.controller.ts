import { NextFunction, Request, Response } from "express";
import announcementModel, { ANNOUNCEMENT_PRIORITIES, ANNOUNCEMENT_TYPES } from "../models/announcement.model";
import { Types } from "mongoose";
import { dispatchAnnouncement } from "../services/announcementNotify.service";
import { cancelScheduledJob } from "../services/outbox.service";
import { getEmployeeData } from "../common/utils/util";
import { activeForUser, announcementState, AnnouncementState, PUBLISH_AT, stateMatch } from "../common/utils/announcementVisibility";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The signed-in employee (the id is never taken from the request body or query). */
const currentEmployee = async (req: any) => req.employee || await getEmployeeData(req.user);

const privilegesOf = (employee: any) => employee?.category?.privileges?.announcement || {};

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const createAnnouncement = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { title, description, isEdit, _id, category, priority, type, pinned, requireAck, link, status } = req.body;
    const employee = await currentEmployee(req);
    if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }
    if (priority && !ANNOUNCEMENT_PRIORITIES.includes(priority)) return res.status(400).json({ success: false, message: 'Invalid priority' });
    if (type && !ANNOUNCEMENT_TYPES.includes(type)) return res.status(400).json({ success: false, message: 'Invalid type' });

    const now = new Date();
    const publishAt = parseDate(req.body.publishAt ?? req.body.date) || now;
    const expiresAt = parseDate(req.body.expiresAt);
    if (expiresAt && expiresAt.getTime() <= publishAt.getTime()) {
      return res.status(400).json({ success: false, message: 'Expiry must be after the publish date' });
    }

    const fields = {
      title: title.trim(),
      description: description.trim(),
      date: publishAt,
      publishAt,
      expiresAt,
      category: Array.isArray(category) && category.length > 0 ? category : ['all'],
      priority: priority || 'normal',
      type: type || 'general',
      pinned: !!pinned,
      requireAck: !!requireAck,
      link: link?.trim() || undefined,
      status: status === 'draft' ? 'draft' : 'published',
    };

    let saved: any;
    if (isEdit) {
      if (!privilegesOf(employee).deleteOrEdit) {
        return res.status(403).json({ success: false, message: 'You do not have permission to edit announcements' });
      }
      const previous: any = await announcementModel.findById(_id).lean();
      if (!previous) return res.status(404).json({ success: false, message: 'Announcement not found' });

      // Edits keep the author, created date and read/acknowledge history
      saved = await announcementModel.findByIdAndUpdate(
        _id,
        { $set: { ...fields, updatedAt: now, updatedBy: employee._id } },
        { new: true }
      );

      const alreadySent = announcementState(previous, now) !== 'draft' && announcementState(previous, now) !== 'scheduled';
      if (!alreadySent) {
        if (fields.status === 'draft') await cancelScheduledJob(`announcement:${_id}`);
        else await dispatchAnnouncement(_id, publishAt);
      }
    } else {
      saved = await announcementModel.create({
        ...fields,
        celeb: false,
        viewedBy: [String(employee._id)],
        createdDate: now,
        createdBy: employee._id,
      });
      if (fields.status !== 'draft') await dispatchAnnouncement(saved._id.toString(), publishAt);
    }

    if (!saved) return res.status(502).json({ success: false, message: 'Failed to save announcement' });
    const message = fields.status === 'draft' ? 'Draft saved' : isEdit ? 'Announcement updated' : 'Announcement created';
    return res.status(200).json({ success: true, message });
  } catch (error) {
    console.log(error)
    next(error);
  }
};

export const getAnnouncement = async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const employee = await currentEmployee(req);
    if (!employee) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const userId = String(employee._id);
    const categoryId = String(employee.category?._id || employee.category || '');
    const privileges = privilegesOf(employee);
    const canManage = !!(privileges.create || privileges.deleteOrEdit);

    const page = Math.max(1, Number(req.query.page) || 1);
    const row = Math.min(100, Math.max(1, Number(req.query.row) || 20));
    const search = String(req.query.search || '').trim();
    const filter = String(req.query.filter || 'all');
    const priority = String(req.query.priority || '');
    const type = String(req.query.type || '');
    const requestedState = String(req.query.state || 'active') as AnnouncementState;
    const state: AnnouncementState = canManage && ['draft', 'scheduled', 'expired'].includes(requestedState) ? requestedState : 'active';
    const now = new Date();

    // Readers only ever see live announcements for their category; authors/admins can also browse the other states
    const conditions: any[] = [];
    if (state === 'active') {
      conditions.push(activeForUser(userId, categoryId, now));
    } else {
      conditions.push(stateMatch(state, now));
      if (!privileges.deleteOrEdit) conditions.push({ createdBy: new Types.ObjectId(userId) });
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      conditions.push({ $or: [{ title: regex }, { description: regex }] });
    }
    if (ANNOUNCEMENT_PRIORITIES.includes(priority as any)) conditions.push({ priority });
    if (ANNOUNCEMENT_TYPES.includes(type as any)) conditions.push({ type });
    if (filter === 'unread') conditions.push({ viewedBy: { $ne: userId } });
    if (filter === 'pinned') conditions.push({ pinned: true });
    if (filter === 'ack') conditions.push({ requireAck: true, 'acknowledgedBy.user': { $ne: new Types.ObjectId(userId) } });

    const match = { $and: conditions };

    const [result, unread, pendingAck] = await Promise.all([
      announcementModel.aggregate([
        { $match: match },
        { $addFields: { publishAt: PUBLISH_AT } },
        { $sort: { pinned: -1, publishAt: -1, _id: -1 } },
        { $facet: { total: [{ $count: 'n' }], items: [{ $skip: (page - 1) * row }, { $limit: row }] } },
      ]),
      announcementModel.countDocuments({ $and: [activeForUser(userId, categoryId, now), { viewedBy: { $ne: userId } }] }),
      announcementModel.countDocuments({ $and: [activeForUser(userId, categoryId, now), { requireAck: true, 'acknowledgedBy.user': { $ne: new Types.ObjectId(userId) } }] }),
    ]);

    const total = result[0]?.total[0]?.n || 0;
    const docs: any[] = await announcementModel.populate(result[0]?.items || [], { path: 'createdBy', select: 'firstName lastName employeeId' }) as any;
    const announcements = docs.map((doc: any) => toListItem(doc, userId, canManage, now));

    res.status(200).json({ total, unread, pendingAck, canManage, announcements });
  } catch (error) {
    console.error('Error in getAnnouncement:', error);
    next(error);
  }
};

/** One announcement, for deep links from a notification. Same visibility rules as the list. */
export const getAnnouncementById = async (req: any, res: Response, next: NextFunction) => {
  try {
    const employee = await currentEmployee(req);
    if (!employee) return res.status(401).json({ message: 'Unauthorized' });
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Announcement not found' });

    const userId = String(employee._id);
    const categoryId = String(employee.category?._id || employee.category || '');
    const privileges = privilegesOf(employee);
    const canManage = !!(privileges.create || privileges.deleteOrEdit);
    const now = new Date();

    const id = new Types.ObjectId(req.params.id);
    const visibility = privileges.deleteOrEdit
      ? {}
      : canManage
        ? { $or: [activeForUser(userId, categoryId, now), { createdBy: new Types.ObjectId(userId) }] }
        : activeForUser(userId, categoryId, now);

    const doc: any = await announcementModel
      .findOne({ $and: [{ _id: id }, visibility] })
      .populate('createdBy', 'firstName lastName employeeId')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Announcement not found' });

    return res.status(200).json(toListItem({ ...doc, publishAt: doc.publishAt ?? doc.date }, userId, canManage, now));
  } catch (error) {
    next(error);
  }
};

const toListItem = (doc: any, userId: string, canManage: boolean, now: Date) => {
  const { viewedBy = [], acknowledgedBy = [], createdBy, ...rest } = doc;
  const author = createdBy && typeof createdBy === 'object' ? createdBy : null;
  return {
    ...rest,
    createdBy: author ? String(author._id) : createdBy,
    authorName: author ? [author.firstName, author.lastName].filter(Boolean).join(' ') : undefined,
    state: announcementState(doc, now),
    isRead: viewedBy.includes(userId),
    isAcknowledged: acknowledgedBy.some((entry: any) => String(entry.user) === userId),
    // Engagement numbers are for the people who manage announcements
    ...(canManage ? { readCount: viewedBy.length, ackCount: acknowledgedBy.length } : {}),
  };
};

export const deleteAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await announcementModel.findByIdAndDelete(id);
    // A scheduled notification for a deleted announcement must not still go out
    await cancelScheduledJob(`announcement:${id}`);
    res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    console.log(error)
    next(error);
  }
};

export const togglePin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const announcement = await announcementModel.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    announcement.pinned = !announcement.pinned;
    await announcement.save();
    return res.status(200).json({ success: true, pinned: announcement.pinned });
  } catch (error) {
    next(error);
  }
};

export const markAsViewed = async (req: any, res: Response) => {
  try {
    const { announcementId } = req.body;
    const employee = await currentEmployee(req);
    if (!announcementId || !employee) {
      return res.status(400).json({ message: 'Announcement ID is required' });
    }

    // $addToSet keeps this idempotent and avoids a read-modify-write race between tabs
    const updated = await announcementModel.findByIdAndUpdate(announcementId, { $addToSet: { viewedBy: String(employee._id) } });
    if (!updated) return res.status(404).json({ message: 'Announcement not found' });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/** Marks every announcement currently live for this user as read. */
export const markAllAsViewed = async (req: any, res: Response, next: NextFunction) => {
  try {
    const employee = await currentEmployee(req);
    if (!employee) return res.status(401).json({ message: 'Unauthorized' });
    const userId = String(employee._id);
    const categoryId = String(employee.category?._id || employee.category || '');

    await announcementModel.updateMany(
      { $and: [activeForUser(userId, categoryId), { viewedBy: { $ne: userId } }] },
      { $addToSet: { viewedBy: userId } }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const acknowledgeAnnouncement = async (req: any, res: Response, next: NextFunction) => {
  try {
    const employee = await currentEmployee(req);
    if (!employee) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { id } = req.params;

    const announcement = await announcementModel.findById(id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (!announcement.requireAck) return res.status(400).json({ success: false, message: 'This announcement does not need acknowledgement' });

    const already = announcement.acknowledgedBy.some((entry) => String(entry.user) === String(employee._id));
    if (!already) {
      announcement.acknowledgedBy.push({ user: employee._id, at: new Date() });
      if (!announcement.viewedBy.includes(String(employee._id))) announcement.viewedBy.push(String(employee._id));
      await announcement.save();
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
