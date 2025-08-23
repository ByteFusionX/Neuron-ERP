import { NextFunction, Request, Response } from "express";
import jobModel, { allocateType } from "../models/job.model"
import employeeModel from "../models/employee.model";
import technicalModel from "../models/technical.model";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";
import { uploadFileToAws } from "../common/aws-connect";
import { calculateCostPricePipe, calculateDiscountPricePipe, getDateRangeByDay, getEmployeeData, getUSDRated } from "../common/utils/util";
import { emailQueue } from "../common/queues/email.queue";

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

export const getCostingDetails = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const qatarUsdRate = await getUSDRated();
      const technical = await technicalModel.aggregate([
         {
            $match: {
               _id: new ObjectId(id),
               jobId: {
                  $exists: true
               }
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
               as: "quotation"
            }
         },
         {
            $unwind: "$quotation"
         },
         {
            $lookup:{
               from: "claims",
               localField: "_id",
               foreignField: "technicalId",
               as: "claims"
            }
         },
         {
            $addFields: {
               totalLPOValue: {
                  $let: {
                     vars: {
                        baseLpoValue: {
                           $sum: {
                              $cond: [
                                 { $eq: ['$quotation.currency', 'USD'] },
                                 {
                                    $multiply: [
                                       calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                       qatarUsdRate
                                    ]
                                 },
                                 calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                              ]
                           }
                        }
                     },
                     in: {
                        $reduce: {
                           input: '$quotation.dealData.additionalCosts',
                           initialValue: '$$baseLpoValue',
                           in: {
                              $cond: [
                                 { $eq: ['$$this.type', 'Customer Discount'] },
                                 { $subtract: ['$$value', '$$this.value'] },
                                 '$$value'
                              ]
                           }
                        }
                     }
                  }
               },
               estimatedCostForProject: {
                  $round: [
                     {
                        $sum: [
                           {
                              $cond: [
                                 { $eq: ['$quotation.currency', 'USD'] },
                                 {
                                    $round: [
                                       {
                                          $multiply: [
                                             calculateCostPricePipe('$quotation.dealData.updatedItems'),
                                             qatarUsdRate
                                          ]
                                       },
                                       2
                                    ]
                                 },
                                 calculateCostPricePipe('$quotation.dealData.updatedItems')
                              ]
                           },

                        ]
                     },
                     2
                  ]
               },
               professionalServiceCharge: {
                  $round: [
                     {
                        $multiply: [
                           '$estimatedCostForProject',
                           0.2
                        ]
                     },
                     2
                  ]
               },
               totalAmountClaimedForManpower: {
                  $reduce: {
                     input: "$claims",
                     initialValue: 0,
                     in: {
                        $cond: [
                           { $eq: ["$$this.category", "manpower"] },
                           { $add: ["$$value", "$$this.amount"] },
                           "$$value"
                        ]
                     }
                  }
               }
            }

         },
         {
            $project: {
               _id: 1,
               totalLPOValue: 1,
               estimatedCostForProject: 1,
               professionalServiceCharge: 1,
               totalAmountClaimedForManpower: 1
            }
         }
      ])

      if (technical.length > 0) {
         return res.status(200).json({
            success: true,
            message: "Costing details fetched successfully",
            data: technical[0]
         });
      } else {
         return res.status(204).json({
            success: false,
            message: "Costing details not found",
            data: []
         });
      }
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to get costing details",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

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
      const { taskName, description, progress, status, priority, timeline, notes, associatedWith } = req.body;
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

export const getProjectUpdates = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { subject, from, to, status, updatedBy, fromDate, toDate, page, row } = req.body;
      console.log(req.body);
      const pipeline: any[] = [
         {
            $match: {
               _id: new ObjectId(id)
            }
         },
         {
            $unwind: "$projectUpdates"
         },
         {
            $lookup: {
               from: "employees",
               localField: "projectUpdates.updatedBy",
               foreignField: "_id",
               as: "projectUpdates.updatedBy"
            }
         },
         {
            $unwind: {
               path: "$projectUpdates.updatedBy",
               preserveNullAndEmptyArrays: true
            }
         },
      ];

      const matchConditions: any = {};

      if (subject) {
         matchConditions["projectUpdates.subject"] = { $regex: subject, $options: 'i' };
      }

      if (from) {
         matchConditions["projectUpdates.from"] = { $regex: from, $options: 'i' };
      }

      if (to) {
         matchConditions["projectUpdates.to"] = { $in: [new RegExp(to, 'i')] };
      }

      if (updatedBy) {
         matchConditions["projectUpdates.updatedBy._id"] = new ObjectId(updatedBy);
      }

      if (status) {
         matchConditions["projectUpdates.status"] = { $in: Array.isArray(status) ? status : [status] };
      }

      if (fromDate && !toDate) {
         const { startOfDay, endOfDay } = getDateRangeByDay(fromDate);
         matchConditions["projectUpdates.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
      }

      if (fromDate && toDate) {
         const fromDateObj = new Date(fromDate);
         const toDateObj = new Date(toDate);
         if (fromDateObj.toDateString() === toDateObj.toDateString()) {
            const { startOfDay, endOfDay } = getDateRangeByDay(fromDate);
            matchConditions["projectUpdates.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
         } else {
            const { startOfDay, endOfDay } = getDateRangeByDay(fromDate, toDate);
            matchConditions["projectUpdates.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
         }
      }

      if (Object.keys(matchConditions).length > 0) {
         pipeline.push({ $match: matchConditions });
      }

      pipeline.push({
         $skip: (page - 1) * row
      },
         {
            $limit: row
         }
      );

      pipeline.push({
         $group: {
            _id: "$_id",
            projectUpdates: { $push: "$projectUpdates" }
         }
      });

      const result = await technicalModel.aggregate(pipeline);

      const totalPipeline: any = [
         {
            $match: {
               _id: new ObjectId(id)
            }
         },
         {
            $unwind: "$projectUpdates"
         },
         {
            $lookup: {
               from: "employees",
               localField: "projectUpdates.updatedBy",
               foreignField: "_id",
               as: "projectUpdates.updatedBy"
            }
         },
         {
            $unwind: {
               path: "$projectUpdates.updatedBy",
               preserveNullAndEmptyArrays: true
            }
         }
      ];

      if (Object.keys(matchConditions).length > 0) {
         totalPipeline.push({ $match: matchConditions });
      }

      totalPipeline.push({
         $count: "total"
      });

      const totalResult = await technicalModel.aggregate(totalPipeline);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      if (result.length > 0) {
         return res.status(200).json({
            success: true,
            message: "Project updates fetched successfully",
            data: result[0].projectUpdates,
            total: total
         });
      } else {
         return res.status(200).json({
            success: true,
            message: "No project updates found",
            data: []
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get project updates",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const getProjectUpdateById = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, updateId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(updateId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or project update ID"
         });
      }

      const pipeline: any[] = [
         {
            $match: {
               _id: new ObjectId(id)
            }
         },
         {
            $unwind: "$projectUpdates"
         },
         {
            $match: {
               "projectUpdates._id": new ObjectId(updateId)
            }
         },
         {
            $lookup: {
               from: "employees",
               localField: "projectUpdates.updatedBy",
               foreignField: "_id",
               as: "projectUpdates.updatedBy"
            }
         },
         {
            $unwind: {
               path: "$projectUpdates.updatedBy",
               preserveNullAndEmptyArrays: true
            }
         },
         {
            $addFields: {
               "projectUpdates.updatedBy.fullName": {
                  $concat: ["$projectUpdates.updatedBy.firstName", " ", "$projectUpdates.updatedBy.lastName"]
               }
            }
         },
         {
            $replaceRoot: { newRoot: "$projectUpdates" }
         }
      ];

      const result = await technicalModel.aggregate(pipeline);

      if (result.length > 0) {
         return res.status(200).json({
            success: true,
            message: "Project update fetched successfully",
            data: result[0]
         });
      } else {
         return res.status(404).json({
            success: false,
            message: "Project update not found"
         });
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get project update",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const createProjectUpdate = async (req: any, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { subject, from, to, cc, message, status } = req.body;

      const token = req.user;
      const userData = await getEmployeeData(token);
      const updatedBy = userData?._id;

      let attachmentFiles = [];
      if (req.files?.attachments) {
         attachmentFiles = await Promise.all(req.files.attachments.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
         }));
      }

      const technical = await technicalModel.findById(id);
      if (technical) {
         const newProjectUpdate = {
            subject,
            from,
            to: Array.isArray(to) ? to : [to],
            cc: Array.isArray(cc) ? cc : [cc],
            message,
            attachments: attachmentFiles,
            status: 'Drafted',
            updatedBy,
            updatedAt: new Date(),
            createdDate: new Date()
         };

         technical.projectUpdates.push(newProjectUpdate as any);
         await technical.save();

         const savedProjectUpdate = technical.projectUpdates[technical.projectUpdates.length - 1] as any;
         const projectId = savedProjectUpdate._id;

         if (status === 'Sent') {
            try {
               const authHeader = req.headers.authorization;
               if (!authHeader) {
                  throw new Error('No authorization header found');
               }

               const jwtToken = authHeader.replace('Bearer ', '');

               emailQueue.addJob({
                  projectId,
                  subject,
                  from,
                  to: Array.isArray(to) ? to : [to],
                  cc: Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean),
                  message,
                  attachments: attachmentFiles,
                  jwtToken,
                  priority: 'high'
               })

            } catch (emailError) {
               console.error('Failed to send email:', emailError);
               return res.status(500).json({
                  success: false,
                  message: "Project update created but failed to send email",
                  error: emailError instanceof Error ? emailError.message : "Email sending failed"
               });
            }
         }

         return res.status(200).json({
            success: true,
            message: status === 'Sent' ? "Project update created and email sent successfully" : "Project update created successfully",
            data: technical.projectUpdates[technical.projectUpdates.length - 1]
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
         message: "Failed to create project update",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateProjectUpdate = async (req: any, res: Response, next: NextFunction) => {
   try {
      const { id, updateId } = req.params;
      const token = req.user;
      const userData = await getEmployeeData(token);
      const updatedBy = userData?._id;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(updateId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or project update ID"
         });
      }

      const { subject, from, to, cc, message, status } = req.body;

      let newAttachmentFiles = [];
      if (req.files?.newAttachments) {
         newAttachmentFiles = await Promise.all(req.files.newAttachments.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
         }));
      }

      const technical = await technicalModel.findById(id);
      if (technical) {
         const projectUpdate: any = technical.projectUpdates.find((pu: any) => pu._id.toString() === updateId);
         if (projectUpdate) {
            const previousStatus = projectUpdate.status;
            const originalId = projectUpdate._id;

            projectUpdate.subject = subject;
            projectUpdate.from = from;
            projectUpdate.to = Array.isArray(to) ? to : [to];
            projectUpdate.cc = Array.isArray(cc) ? cc : [cc];
            projectUpdate.message = message;
            projectUpdate.status = status;
            projectUpdate.updatedBy = updatedBy;
            projectUpdate.updatedAt = new Date();
            projectUpdate._id = originalId;

            if (newAttachmentFiles.length > 0) {
               projectUpdate.attachments = [...projectUpdate.attachments, ...newAttachmentFiles];
            }

            await technical.save();

            if (status === 'Sent' && previousStatus !== 'Sent') {
               try {
                  const authHeader = req.headers.authorization;
                  if (!authHeader) {
                     throw new Error('No authorization header found');
                  }

                  const jwtToken = authHeader.replace('Bearer ', '');

                  emailQueue.addJob({
                     projectId: originalId,
                     subject,
                     from,
                     to: Array.isArray(to) ? to : [to],
                     cc: Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean),
                     message,
                     attachments: [...projectUpdate.attachments],
                     jwtToken,
                     priority: 'high'
                  });

               } catch (emailError) {
                  console.error('Failed to send email:', emailError);
                  return res.status(500).json({
                     success: false,
                     message: "Project update updated but failed to send email",
                     error: emailError instanceof Error ? emailError.message : "Email sending failed"
                  });
               }
            }

            return res.status(200).json({
               success: true,
               message: status === 'Sent' && previousStatus !== 'Sent' ? "Project update updated and email sent successfully" : "Project update updated successfully",
               data: projectUpdate
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Project update not found"
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
         message: "Failed to update project update",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const deleteProjectUpdate = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, updateId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(updateId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or project update ID"
         });
      }

      const technical = await technicalModel.findById(id);
      if (technical) {
         const updateIndex = technical.projectUpdates.findIndex((pu: any) => pu._id.toString() === updateId);
         if (updateIndex !== -1) {
            technical.projectUpdates.splice(updateIndex, 1);
            await technical.save();
            return res.status(200).json({
               success: true,
               message: "Project update deleted successfully"
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Project update not found"
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
         message: "Failed to delete project update",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const removeProjectUpdateAttachment = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, updateId } = req.params;
      const { fileName } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(updateId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical or project update ID"
         });
      }

      const technical = await technicalModel.findById(id);
      if (technical) {
         const projectUpdate = technical.projectUpdates.find((pu: any) => pu._id.toString() === updateId);
         if (projectUpdate) {
            const attachmentIndex = projectUpdate.attachments.findIndex((att: any) => att.fileName === fileName);
            if (attachmentIndex !== -1) {
               projectUpdate.attachments.splice(attachmentIndex, 1);
               projectUpdate.updatedAt = new Date();
               await technical.save();

               return res.status(200).json({
                  success: true,
                  message: "Attachment removed successfully",
                  data: projectUpdate
               });
            } else {
               return res.status(404).json({
                  success: false,
                  message: "Attachment not found"
               });
            }
         } else {
            return res.status(404).json({
               success: false,
               message: "Project update not found"
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
         message: "Failed to remove attachment",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}


export const updateMaterialRequest = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { materialRequest } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      if (!Array.isArray(materialRequest)) {
         return res.status(400).json({
            success: false,
            message: "Material request must be an array"
         });
      }

      for (let i = 0; i < materialRequest.length; i++) {
         const item = materialRequest[i];

         if (!item.itemName || typeof item.itemName !== 'string' || item.itemName.trim().length === 0) {
            return res.status(400).json({
               success: false,
               message: `Item name is required for material request item ${i + 1}`
            });
         }

         if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
            return res.status(400).json({
               success: false,
               message: `Quantity must be a positive number for material request item ${i + 1}`
            });
         }

         if (item.estimatedCost === undefined || typeof item.estimatedCost !== 'number' || item.estimatedCost < 0) {
            return res.status(400).json({
               success: false,
               message: `Estimated cost must be a non-negative number for material request item ${i + 1}`
            });
         }

         if (!item.requiredOn || !Date.parse(item.requiredOn)) {
            return res.status(400).json({
               success: false,
               message: `Required date must be a valid date for material request item ${i + 1}`
            });
         }
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      const sanitizedMaterialRequest = materialRequest.map(item => ({
         itemName: item.itemName.trim(),
         quantity: Number(item.quantity),
         estimatedCost: Number(item.estimatedCost),
         requiredOn: new Date(item.requiredOn),
         remarks: item.remarks ? item.remarks.trim() : ''
      }));

      technical.materialRequest = sanitizedMaterialRequest;
      technical.updatedAt = new Date();
      await technical.save();

      return res.status(200).json({
         success: true,
         message: "Material request updated successfully",
         data: technical.materialRequest
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to update material request",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const getBillingSummaries = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const technical = await technicalModel.findById(id, { billingSummary: 1 })
         .populate('billingSummary.createdBy', 'firstName lastName');

      const qatarUsdRate = await getUSDRated();

      const lpoValue = await technicalModel.aggregate([
         {
            $match: {
               _id: new mongoose.Types.ObjectId(id)
            }
         },
         {
            $lookup: {
               from: 'jobs',
               localField: 'jobId',
               foreignField: '_id',
               as: 'job'
            }
         },
         {
            $unwind: '$job'
         },
         {
            $lookup: {
               from: 'quotations',
               localField: 'job.quoteId',
               foreignField: '_id',
               as: 'quotation'
            }
         },
         {
            $unwind: '$quotation'
         },
         {
            $addFields: {
               lpoValue: {
                  $let: {
                     vars: {
                        baseLpoValue: {
                           $sum: {
                              $cond: [
                                 { $eq: ['$quotation.currency', 'USD'] },
                                 {
                                    $multiply: [
                                       calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount'),
                                       qatarUsdRate
                                    ]
                                 },
                                 calculateDiscountPricePipe('$quotation.dealData.updatedItems', '$quotation.dealData.totalDiscount')
                              ]
                           }
                        }
                     },
                     in: {
                        $reduce: {
                           input: '$quotation.dealData.additionalCosts',
                           initialValue: '$$baseLpoValue',
                           in: {
                              $cond: [
                                 { $eq: ['$$this.type', 'Customer Discount'] },
                                 { $subtract: ['$$value', '$$this.value'] },
                                 '$$value'
                              ]
                           }
                        }
                     }
                  }
               }
            }
         },
         {
            $project: {
               lpoValue: '$lpoValue'
            }
         }
      ])

      console.log(lpoValue);

      if (technical) {
         return res.status(200).json({
            success: true,
            message: "Billing summaries fetched successfully",
            data: technical.billingSummary,
            lpoValue: lpoValue[0].lpoValue ? lpoValue[0].lpoValue : 0
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
         message: "Failed to get billing summaries",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const getBillingSummaryById = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, billingSummaryId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(billingSummaryId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project or billing summary ID"
         });
      }

      const technical = await technicalModel.findById(id).populate('billingSummary.createdBy', 'firstName lastName');

      if (technical) {
         const billingSummary = technical.billingSummary.find((bs: any) => bs._id.toString() === billingSummaryId);
         if (billingSummary) {
            return res.status(200).json({
               success: true,
               message: "Billing summary fetched successfully",
               data: billingSummary
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Billing summary not found"
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
         message: "Failed to get billing summary",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const createBillingSummary = async (req: any, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { invoicedAmount, invoicedAgainst, invoicedDate } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const token = req.user;
      const userData = await getEmployeeData(token);
      const createdBy = userData?._id;

      if (!createdBy) {
         return res.status(401).json({
            success: false,
            message: "User authentication required"
         });
      }

      const technical = await technicalModel.findById(id);

      if (technical) {
         const newBillingSummary = {
            invoicedAmount: Number(invoicedAmount),
            invoicedAgainst: invoicedAgainst,
            createdBy,
            createdAt: new Date()
         };

         if (invoicedDate) {
            newBillingSummary['invoicedDate'] = new Date(invoicedDate);
         }

         technical.billingSummary.push(newBillingSummary as any);
         await technical.save();

         return res.status(200).json({
            success: true,
            message: "Billing summary created successfully",
            data: technical.billingSummary[technical.billingSummary.length - 1]
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
         message: "Failed to create billing summary",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const updateBillingSummary = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, billingSummaryId } = req.params;
      const { invoicedAmount, invoicedAgainst, invoicedDate } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(billingSummaryId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project or billing summary ID"
         });
      }

      const technical = await technicalModel.findById(id);

      if (technical) {
         const billingSummary = technical.billingSummary.find((bs: any) => bs._id.toString() === billingSummaryId);

         if (billingSummary) {
            if (invoicedAmount !== undefined) billingSummary.invoicedAmount = Number(invoicedAmount);
            if (invoicedAgainst !== undefined) billingSummary.invoicedAgainst = invoicedAgainst;
            invoicedDate ? billingSummary.invoicedDate = new Date(invoicedDate) : delete billingSummary.invoicedDate;

            await technical.save();

            return res.status(200).json({
               success: true,
               message: "Billing summary updated successfully",
               data: billingSummary
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Billing summary not found"
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
         message: "Failed to update billing summary",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const deleteBillingSummary = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, billingSummaryId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(billingSummaryId)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project or billing summary ID"
         });
      }

      const technical = await technicalModel.findById(id);

      if (technical) {
         const billingSummaryIndex = technical.billingSummary.findIndex((bs: any) => bs._id.toString() === billingSummaryId);

         if (billingSummaryIndex !== -1) {
            technical.billingSummary.splice(billingSummaryIndex, 1);
            await technical.save();

            return res.status(200).json({
               success: true,
               message: "Billing summary deleted successfully"
            });
         } else {
            return res.status(404).json({
               success: false,
               message: "Billing summary not found"
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
         message: "Failed to delete billing summary",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}