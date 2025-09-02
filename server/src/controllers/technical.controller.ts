import { NextFunction, Request, Response } from "express";
import jobModel, { allocateType } from "../models/job.model"
import employeeModel from "../models/employee.model";
import technicalModel from "../models/technical.model";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";

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
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(taskId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or task ID"
         });
      }
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

export const getIssues = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { subject, issueType, companyName, status } = req.body;
      
      const pipeline: any[] = [
         {
            $match: {
               _id: new ObjectId(id)
            }
         },
         {
            $unwind: "$issues"
         },
         {
            $lookup: {
               from: "customers",
               localField: "issues.customer",
               foreignField: "_id",
               as: "issues.customer"
            }
         },
         {
            $unwind: "$issues.customer"
         }
      ];

      const matchConditions: any = {};

      if (subject) {
         matchConditions["issues.subject"] = { $regex: subject, $options: 'i' };
      }

      if (issueType) {
         matchConditions["issues.issueType"] = issueType;
      }

      if (companyName) {
         matchConditions["issues.customer._id"] = new ObjectId(companyName);
      }

      if (status) {
         matchConditions["issues.status"] = { $in: Array.isArray(status) ? status : [status] };
      }

      if (Object.keys(matchConditions).length > 0) {
         pipeline.push({ $match: matchConditions });
      }

      pipeline.push({
         $group: {
            _id: "$_id",
            issues: { $push: "$issues" }
         }
      });

      const result = await technicalModel.aggregate(pipeline);

      if (result.length > 0) {
         return res.status(200).json({
            success: true,
            message: "Issues fetched successfully",
            data: result[0].issues
         });
      } else {
         return res.status(200).json({
            success: true,
            message: "No issues found",
            data: []
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get issues",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const createIssue = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const issueData = req.body;
      const technical = await technicalModel.findById(id);
      if (technical) {
         technical.issues.push(issueData);
         await technical.save();
         return res.status(200).json({
            success: true,
            message: "Issue created successfully",
            data: technical.issues[technical.issues.length - 1]
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to create issue",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateIssue = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, issueId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(issueId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or issue ID"
         });
      }
      const { subject, customer, issueType, raisedBy, description, status, respondedOn, closedBy, closedOn, comments, updatedBy, updatedAt } = req.body;
      const technical = await technicalModel.findById(id);
      if (technical) {
         const issue = technical.issues.find((t: any) => t._id.toString() === issueId);
         if (issue) {
            issue.subject = subject;
            issue.customer = customer;
            issue.issueType = issueType;
            issue.raisedBy = raisedBy;
            issue.description = description;
            issue.status = status;
            issue.respondedOn = respondedOn;
            issue.closedBy = closedBy;
            issue.closedOn = closedOn;
            issue.comments = comments;
            issue.updatedBy = updatedBy;
            issue.updatedAt = updatedAt;
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Issue updated successfully",
               data: issue
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Issue not found"
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
         message: "Failed to update issue",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const deleteIssue = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, issueId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(issueId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or issue ID"
         });
      }
      const technical = await technicalModel.findById(id);
      if (technical) {
         const issueIndex = technical.issues.findIndex((t: any) => t._id.toString() === issueId);
         if (issueIndex !== -1) {
            technical.issues.splice(issueIndex, 1);
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Issue deleted successfully"
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Issue not found"
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
         message: "Failed to delete issue",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }

   
}

export const getActivityPlans = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const technical = await technicalModel.findById(id, { activityPlan: 1 }).populate('activityPlan.includedEmployees');
      if (technical) {
         return res.status(200).json({
            success: true,
            message: "Activity plans fetched successfully",
            data: technical.activityPlan
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get activity plans",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const createActivityPlan = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { activityName, startDate, endDate, includedEmployees } = req.body;
      const technical = await technicalModel.findById(id);
      if (technical) {
         technical.activityPlan.push({ activityName, startDate, endDate, includedEmployees, status: "Pending", comment: "" } as any);
         await technical.save();
         return res.status(200).json({
            success: true,
            message: "Activity plan created successfully",
            data: technical.activityPlan[technical.activityPlan.length - 1]
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to create activity plan",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateActivityPlan = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, activityPlanId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(activityPlanId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or activity plan ID"
         });
      }
      const { activityName, startDate, endDate, includedEmployees } = req.body;
      const technical = await technicalModel.findById(id);
      if (technical) {
         const activityPlan = technical.activityPlan.find((ap: any) => ap._id.toString() === activityPlanId);
         if (activityPlan) {
            activityPlan.activityName = activityName;
            activityPlan.startDate = startDate;
            activityPlan.endDate = endDate;
            activityPlan.includedEmployees = includedEmployees;
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Activity plan updated successfully",
               data: activityPlan
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Activity plan not found"
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
         message: "Failed to update activity plan",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const closeActivityPlan = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, activityPlanId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(activityPlanId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or activity plan ID"
         });
      }
      const { orginalStartDate, orginalEndDate, comment } = req.body;
      const technical = await technicalModel.findById(id);
      if (technical) {
         const activityPlan = technical.activityPlan.find((ap: any) => ap._id.toString() === activityPlanId);
         if (activityPlan) {
            activityPlan.orginalStartDate = orginalStartDate;
            activityPlan.orginalEndDate = orginalEndDate;
            activityPlan.comment = comment;
            activityPlan.status = "Closed";
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Activity plan closed successfully",
               data: activityPlan
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Activity plan not found"
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
         message: "Failed to update activity plan",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const deleteActivityPlan = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, activityPlanId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(activityPlanId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or activity plan ID"
         });
      }
      const technical = await technicalModel.findById(id);
      if (technical) {
         const activityPlanIndex = technical.activityPlan.findIndex((ap: any) => ap._id.toString() === activityPlanId);
         if (activityPlanIndex !== -1) {
            technical.activityPlan.splice(activityPlanIndex, 1);
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Activity plan deleted successfully"
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Activity plan not found"
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
         message: "Failed to delete activity plan",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}