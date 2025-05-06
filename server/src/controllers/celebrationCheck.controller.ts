import { Request, Response, NextFunction } from "express"
import announcementModel from "../models/announcement.model"

export const celebrationCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    const celebData = await announcementModel.find({
      $and: [
        { celeb: true },
        { date: { $gte: today, $lt: tomorrow } }
      ]
    });
    if (celebData.length) return res.status(200).json(celebData)
    return res.status(204).json('No data found')


  } catch (error) {
    console.log(error)
next(error)
  }
}