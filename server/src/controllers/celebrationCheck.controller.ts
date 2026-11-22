import { Request, Response, NextFunction } from "express"
import announcementModel from "../models/announcement.model"
import employeeModel from "../models/employee.model"

export const celebrationCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    // Blocked/deleted employees' posts are hidden here rather than deleted
    const inactiveIds = (await employeeModel.find({ $or: [{ isBlocked: true }, { isDeleted: true }] }).select('_id').lean()).map((e: any) => e._id);
    const celebData = await announcementModel.find({
      $and: [
        { celeb: true },
        { date: { $gte: today, $lt: tomorrow } },
        { employee: { $nin: inactiveIds } }
      ]
    });
    if (celebData.length) return res.status(200).json(celebData)
    return res.status(204).json('No data found')


  } catch (error) {
    console.log(error)
next(error)
  }
}