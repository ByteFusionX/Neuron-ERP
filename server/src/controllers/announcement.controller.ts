import { NextFunction, Request, Response } from "express";
import announcementModel from "../models/announcement.model";
import { Server } from "socket.io";
import { connectedSockets } from "../services/socket-io.service";
import employeeModel from "../models/employee.model";
import { Types } from "mongoose";
import { createNotificationWithPrivileges } from "./notification.controller";

export const createAnnouncement = async (req: any, res: Response, next: NextFunction) => {
  try {
    const { title, description, date, userId, isEdit, _id, category } = req.body;

    const announcementDoc = {
      title,
      date,
      description,
      celeb: false,
      viewedBy: userId ? [userId] : [],
      category: category.length > 0 ? category : ['all'],
      createdDate: new Date(),
      createdBy: userId
    };

    let saveAnnouncement;
    if (isEdit) {
      // Update existing announcement
      saveAnnouncement = await announcementModel.findByIdAndUpdate(
        _id,
        announcementDoc,
        { new: true }
      );
    } else {
      // Create new announcement
      saveAnnouncement = await announcementModel.create(announcementDoc);
    }

    if (saveAnnouncement) {
      const socket = req.app.get('io') as Server;
      
      const userData = await employeeModel.find({ isDeleted: { $ne: true } });
      const announcementCategory = category.length > 0 ? category : ['all'];
      
      const eligibleUsers = userData.filter(user => 
        announcementCategory.includes('all') || announcementCategory.some(cat => user.category?.toString() === cat)
      );

      const eligibleUserIds = eligibleUsers
        .map(user => user._id.toString())
        .filter(id => id !== userId);

      if (eligibleUserIds.length > 0) {
        await createNotificationWithPrivileges(
          {
            type: 'Announcement',
            referenceModel: 'Announcement',
            title: title,
            message: description,
            sentBy: userId,
            referenceId: saveAnnouncement._id,
            additionalData: { announcementId: saveAnnouncement._id.toString() }
          },
          {
            privilegeKey: 'announcement',
            checkFunction: (privileges, employeeId) => {
              if (!employeeId) return false;
              const user = eligibleUsers.find(u => u._id.toString() === employeeId);
              if (!user) return false;
              const userCategory = announcementCategory.includes('all') || 
                announcementCategory.some(cat => user.category?.toString() === cat);
              return userCategory && privileges.announcement?.viewReport !== 'none';
            }
          },
          socket
        );
      }

      return res.status(200).json({ success: true, message: isEdit ? 'Announcement updated' : 'Announcement created' });
    }
    return res.status(502).json({ success: false, message: 'Failed to save announcement' });
  } catch (error) {
    console.log(error)
next(error);
  }
};

export const getAnnouncement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Number(req.query.page);
    const row = Number(req.query.row);
    const userCategoryId = req.query.userCategoryId;
    const userId = req.query.userId;
    const skip = (page - 1) * row;

    const pipeline: any[] = [
      {
        $match: {
          $or: [
            { createdBy: new Types.ObjectId(userId as string) },
            { category: { $in: ['all'] } },
            { category: { $in: [userCategoryId] } }
          ]
        }
      },
      { $sort: { createdDate: -1 } },
      { $skip: skip },
      { $limit: row },
    ]

    const totalAnnouncements = await announcementModel.countDocuments({
      $or: [
        { createdBy: new Types.ObjectId(userId as string) },
        { category: { $in: ['all'] } },
        { category: { $in: [userCategoryId] } }
      ]
    });

    const announcementData = await announcementModel.aggregate(pipeline);

    if (!announcementData.length) {
      res.status(204).json();
    } else {
      res.status(200).json({ total: totalAnnouncements, announcements: announcementData });
    }
  } catch (error) {
    console.error('Error in getAnnouncement:', error);
    console.log(error)
next(error);
  }
};

export const deleteAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await announcementModel.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (error) {
    console.log(error)
next(error);
  }
};


export const markAsViewed = async (req: Request, res: Response) => {
  const { userId, announcementId } = req.body;

  try {
    if (!announcementId || !userId) {
      return res.status(400).json({ message: 'Announcement ID and User ID are required' });
    }

    // Find the announcement by ID
    const announcement = await announcementModel.findById(announcementId);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    // Check if the user has already viewed the announcement
    if (announcement.viewedBy.includes(userId)) {
      return res.status(200).json({ message: 'Announcement already viewed' });
    }

    // Add the user ID to the viewedBy array
    announcement.viewedBy.push(userId);

    // Save the updated announcement
    const updatedAnnouncement = await announcement.save();

    return res.status(200).json(updatedAnnouncement);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};



