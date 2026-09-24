import { Request, Response, NextFunction } from "express";
import MasterDataAudit from "../models/masterDataAudit.model";

export const getMasterDataAudit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await MasterDataAudit.find().sort({ at: -1 }).limit(200).lean();
    return res.status(200).json(rows);
  } catch (error) {
    console.log(error);
    next(error);
  }
};
