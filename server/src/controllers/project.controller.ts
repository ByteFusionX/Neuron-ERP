import { NextFunction, Request, Response } from "express";
import jobModel, { allocateType } from "../models/job.model"

/**
 * Get jobs with allocation type "Project With Supply" and "AMC"
 */
export const getProjectAndAMCJobs = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const jobs = await jobModel.find({
         allocateType: {
            $in: [allocateType.ProjectWithSupply, allocateType.AMC]
         },
         isDeleted: false
      });

      return res.status(200).json({
         success: true,
         data: jobs
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to fetch jobs",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};