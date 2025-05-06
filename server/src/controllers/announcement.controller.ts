import { NextFunction, Request, Response } from "express";
import announcementModel from "../models/announcement.model";
import { Server } from "socket.io";
import { connectedSockets } from "../service/socket-ioService";
import employeeModel from "../models/employee.model";
import { Types } from "mongoose";

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

    const userData = await employeeModel.find();
  

    if (saveAnnouncement) {
      const socket = req.app.get('io') as Server;
      
      // Filter users based on category
      const eligibleUsers = userData.filter(user => 
        // If announcement is for 'all' or user's category matches announcement category
        category.includes('all') || category.some(cat => user.category?.toString() === cat)
      );

      // Get eligible user IDs and filter out the creator
      const eligibleUserIds = eligibleUsers
        .map(user => user._id.toString())
        .filter(id => id !== userId);

      // Emit notifications only to eligible users who are connected
      eligibleUserIds.forEach(userId => {
        if (connectedSockets[userId]) {
          socket.to(userId).emit("notifications", 'announcement');
        }
      });

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



