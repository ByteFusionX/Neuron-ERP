import { NextFunction, Request, Response } from "express";
import jobModel, { allocateType } from "../models/job.model"
import employeeModel from "../models/employee.model";
import technicalModel from "../models/technical.model";
import { ObjectId } from "mongodb";
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

export const getEngineers = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const engineers = await employeeModel.find({
         isDeleted: false
      });

      return res.status(200).json({
         success: true,
         message: "Engineers fetched successfully",
         data: engineers
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to fetch engineers",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

export const assignEngineer = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { jobId, engineerId, comment, assignedBy, projectType, customerId, priority } = req.body;
      const engineer = await employeeModel.findById(engineerId);
      if (!engineer) {
         return res.status(404).json({
            success: false,
            message: "Engineer not found"
         });
      }
      const technicalProject = await technicalModel.create({
         jobId: jobId,
         customer: customerId,
         assignedTo: engineerId,
         comment,
         assignedBy,
         assignedAt: new Date(),
         status: 'Pending',
         projectType: projectType,
         priority: priority
      });
      return res.status(200).json({
         success: true,
         message: "Engineer assigned successfully",
         data: technicalProject
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to assign engineer",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { companyName, jobId, assignedTo, assignedBy, priority, row, page, projectType, status } = req.body;

      const pipeline: any[] = [
         {
            $lookup: {
               from: "jobs",
               localField: "jobId",
               foreignField: "_id",
               as: "jobId"
            }
         },
         {
            $unwind: "$jobId"
         },
         {
            $lookup: {
               from: "customers",
               localField: "customer",
               foreignField: "_id",
               as: "customer"
            }
         },
         {
            $unwind: "$customer"
         },
         {
            $lookup: {
               from: "employees",
               localField: "assignedTo",
               foreignField: "_id",
               as: "assignedTo"
            }
         },
         {
            $unwind: "$assignedTo"
         },
         {
            $addFields: {
               "assignedTo.fullName": {
                  $concat: ["$assignedTo.firstName", " ", "$assignedTo.lastName"]
               }
            }
         },
         {
            $lookup: {
               from: "employees",
               localField: "assignedBy",
               foreignField: "_id",
               as: "assignedBy"
            }
         },
         {
            $unwind: "$assignedBy"
         },
         {
            $addFields: {
               "assignedBy.fullName": {
                  $concat: ["$assignedBy.firstName", " ", "$assignedBy.lastName"]
               }
            }
         },
         {
            $skip: (page - 1) * row
         },
         {
            $limit: row
         }
      ];

      const matchConditions: any = {};

      if (companyName) {
         matchConditions["customer.companyName"] = { $regex: companyName, $options: 'i' };
      }

      if (jobId) {
         matchConditions["jobId.jobId"] = { $regex: jobId, $options: 'i' };
      }

      if (assignedTo) {
         matchConditions["$or"] = [
            { "assignedTo.firstName": { $regex: assignedTo, $options: 'i' } },
            { "assignedTo.lastName": { $regex: assignedTo, $options: 'i' } },
            { "assignedTo.fullName": { $regex: assignedTo, $options: 'i' } }
         ];
      }

      if (assignedBy) {
         if (matchConditions["$or"]) {
            matchConditions["$and"] = [
               { "$or": matchConditions["$or"] },
               {
                  "$or": [
                     { "assignedBy.firstName": { $regex: assignedBy, $options: 'i' } },
                     { "assignedBy.lastName": { $regex: assignedBy, $options: 'i' } },
                     { "assignedBy.fullName": { $regex: assignedBy, $options: 'i' } }
                  ]
               }
            ];
            delete matchConditions["$or"];
         } else {
            matchConditions["$or"] = [
               { "assignedBy.firstName": { $regex: assignedBy, $options: 'i' } },
               { "assignedBy.lastName": { $regex: assignedBy, $options: 'i' } },
               { "assignedBy.fullName": { $regex: assignedBy, $options: 'i' } }
            ];
         }
      }

      if (priority) {
         matchConditions.priority = priority;
      }

      if (projectType) {
         matchConditions.projectType = projectType;
      }

      if (status) {
         matchConditions.status = { $in: status };
      }

      if (Object.keys(matchConditions).length > 0) {
         pipeline.push({ $match: matchConditions });
      }


      const projects = await technicalModel.aggregate(pipeline);

      return res.status(200).json({
         success: true,
         message: projects.length > 0 ? "Projects fetched successfully" : "No projects found",
         data: projects
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get projects",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

export const getProjectById = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const project = await technicalModel.aggregate([
         {
            $match: {
               _id: new ObjectId(id)
            }
         },
         {
            $lookup: {
               from: "jobs",
               localField: "jobId",
               foreignField: "_id",
               as: "jobId"
            }
         },
         {
            $unwind: "$jobId"
         },
         {
            $lookup: {
               from: "quotations",
               localField: "jobId.quoteId",
               foreignField: "_id",
               as: "jobId.quotation"
            }
         },
         {
            $unwind: "$jobId.quotation"
         },
         {
            $lookup: {
               from: "employees",
               localField: "jobId.quotation.createdBy",
               foreignField: "_id",
               as: "jobId.quotation.createdBy"
            }
         },
         {
            $unwind: "$jobId.quotation.createdBy"
         },
         {
            $addFields: {
               "jobId.quotation.createdBy.fullName": {
                  $concat: ["$jobId.quotation.createdBy.firstName", " ", "$jobId.quotation.createdBy.lastName"]
               }
            }
         },
         {
            $lookup: {
               from: "customers",
               localField: "customer",
               foreignField: "_id",
               as: "customer"
            }
         },
         {
            $unwind: "$customer"
         },
         {
            $lookup: {
               from: "employees",
               localField: "assignedTo",
               foreignField: "_id",
               as: "assignedTo"
            }
         },
         {
            $unwind: "$assignedTo"
         },
         {
            $addFields: {
               "assignedTo.fullName": {
                  $concat: ["$assignedTo.firstName", " ", "$assignedTo.lastName"]
               }
            }
         },
         {
            $lookup: {
               from: "employees",
               localField: "assignedBy",
               foreignField: "_id",
               as: "assignedBy"
            }
         },
         {
            $unwind: "$assignedBy"
         },
         {
            $addFields: {
               "assignedBy.fullName": {
                  $concat: ["$assignedBy.firstName", " ", "$assignedBy.lastName"]
               }
            }
         }
      ]);

      if (project.length > 0) {
         return res.status(200).json({
            success: true,
            message: "Project fetched successfully",
            data: project[0]
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Project not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { jobId, status, priority, projectType, materialRequest } = req.body;

      const project = await technicalModel.findByIdAndUpdate(id, { jobId, status, priority, projectType, materialRequest }, { new: true });

      return res.status(200).json({
         success: true,
         message: "Project updated successfully",
         data: project
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to update project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const getTasks = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const tasks = await technicalModel.findById(id, { tasks: 1 }).populate('tasks.associatedWith');
      if (tasks) {
         return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully",
            data: tasks.tasks
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Tasks not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get tasks",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const createTask = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { taskName,description, progress, status, priority, timeline, notes, associatedWith } = req.body;
      const task = await technicalModel.findById(id);
      if (task) {
         task.tasks.push({ taskName, description, progress, status, priority, timeline, notes, associatedWith });
         await task.save();
      } else {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      return res.status(200).json({
         success: true,
         message: "Task created successfully",
         data: task
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to create task",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, taskId } = req.params;
      const { taskName, description, progress, status, priority, timeline, notes, associatedWith } = req.body;
      const project = await technicalModel.findById(id);
      if (project) {
         const task = project.tasks.find((t: any) => t._id.toString() === taskId);
         if (task) {
            task.taskName = taskName;
            task.description = description;
            task.progress = progress;
            task.status = status;
            task.priority = priority;
            task.timeline = timeline;
            task.notes = notes;
            task.associatedWith = associatedWith;
            await project.save();
            return res.status(200).json({
               success: true,
               message: "Task updated successfully",
               data: task
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Task not found"
            });
         }
      } else {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to update task",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}