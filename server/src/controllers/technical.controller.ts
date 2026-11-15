import { NextFunction, Request, Response } from "express";
import jobModel, { allocateType } from "../models/job.model"
import employeeModel from "../models/employee.model";
import { issueDocNo } from "../services/docNumber.service";
import technicalModel from "../models/technical.model";
import projectModel, { PROJECT_STATUSES } from "../models/project.model";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";
import { poLineUsage } from "./purchaseRequest.controller";
import { uploadFileToAws } from "../common/aws-connect";
import { calculateCostPricePipe, calculateDiscountPricePipe, getDateRangeByDay, getEmployeeData, getUSDRated, buildPrivilegeAccessFilter } from "../common/utils/util";
import { emailQueue } from "../common/queues/email.queue";
import purchaseRequestModel from "../models/purchaseRequest.model";
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import { buildGridFilterMatch, buildGridSort, GridFieldMap } from "../common/utils/grid-query";
import { getCustomerCommercialGuard } from "../common/customer-commercial-guards";
import { logAudit } from "../services/audit.service";

export const getProjectAndAMCJobs = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }

      const privileges = employee.category?.privileges;
      const accessFilter = privileges?.technical?.viewReport && privileges.technical.viewReport !== 'none'
         ? await buildPrivilegeAccessFilter(employee._id, privileges.technical.viewReport, 'createdBy')
         : {};

      const filter: any = {
         allocateType: {
            $in: [allocateType.ProjectWithSupply, allocateType.AMC]
         },
         isDeleted: false,
         ...accessFilter
      };

      const jobs = await jobModel.find(filter);

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

export const getUnassignedJobsByCustomer = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { customerId } = req.params;
      
      if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
         return res.status(400).json({
            success: false,
            message: "Valid customer ID is required"
         });
      }

      // Get all assigned job IDs
      const assignedJobIds = await technicalModel.distinct('jobId');
      
      // Find unassigned jobs for specific customer
      const unassignedJobs = await jobModel.aggregate([
         {
            $match: {
               isDeleted: { $ne: true },
               allocateType: { $in: [allocateType.ProjectWithSupply, allocateType.AMC] },
               _id: { $nin: assignedJobIds }
            }
         },
         {
            $lookup: { 
               from: 'quotations', 
               localField: 'quoteId', 
               foreignField: '_id', 
               as: 'quotation' 
            }
         },
         {
            $unwind: '$quotation'
         },
         {
            $lookup: { 
               from: 'customers', 
               localField: 'quotation.client', 
               foreignField: '_id', 
               as: 'clientDetails' 
            }
         },
         {
            $unwind: '$clientDetails'
         },
         {
            $match: {
               'clientDetails._id': new ObjectId(customerId)
            }
         },
         {
            $project: {
               _id: 1,
               jobId: 1,
               allocateType: 1,
               quotation: {
                  _id: 1,
                  subject: 1,
                  quoteId: 1
               },
               clientDetails: {
                  _id: 1,
                  companyName: 1
               }
            }
         },
         {
            $sort: { createdDate: -1 }
         }
      ]);

      return res.status(200).json({
         success: true,
         message: unassignedJobs.length > 0 ? "Unassigned jobs fetched successfully" : "No unassigned jobs found for this customer",
         data: unassignedJobs
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to fetch unassigned jobs",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

export const assignEngineer = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { jobId, engineerId, comment, assignedBy, projectType, customerId, priority } = req.body;
      
      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }
      
      // Validate required fields (comment is optional)
      if (!jobId || !engineerId || !assignedBy || !projectType || !customerId || !priority) {
         return res.status(400).json({
            success: false,
            message: "Job ID, Engineer ID, Assigned By, Project Type, Customer ID, and Priority are required"
         });
      }
      const customerGuard = await getCustomerCommercialGuard(customerId);
      if (customerGuard.blocked) {
         return res.status(409).json({
            success: false,
            message: customerGuard.message
         });
      }

      // Check if engineer exists
      const engineer = await employeeModel.findById(engineerId);
      if (!engineer) {
         return res.status(404).json({
            success: false,
            message: "Engineer not found"
         });
      }

      // Check if job is already assigned
      const existingAssignment = await technicalModel.findOne({ jobId: jobId });
      if (existingAssignment) {
         return res.status(400).json({
            success: false,
            message: "This job is already assigned to an engineer"
         });
      }

      // Create technical project
      const technicalProject = await technicalModel.create({
         jobId: jobId,
         customer: customerId,
         assignedTo: engineerId,
         comment: comment || '',
         assignedBy,
         assignedAt: new Date(),
         status: 'Pending',
         projectType: projectType,
         priority: priority,
         createdAt: new Date(),
         updatedAt: new Date()
      });

      // Populate the response with engineer and customer details
      const populatedProject = await technicalModel.findById(technicalProject._id)
         .populate('assignedTo', 'firstName lastName employeeId')
         .populate('assignedBy', 'firstName lastName')
         .populate('customer', 'companyName')
         .populate('jobId', 'jobId');

      const jobNumber = (populatedProject as any)?.jobId?.jobId || jobId;
      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'TechnicalAssigned',
            referenceModel: 'Technical',
            title: 'Technical Project Assigned',
            message: `You have been assigned to technical project of job ${jobNumber}`,
            sentBy: employee._id?.toString(),
            referenceId: technicalProject._id,
            additionalData: { projectId: technicalProject._id.toString() }
         },
         {
            privilegeKey: 'technical',
            checkFunction: (privileges, empId) => {
               return empId === engineerId.toString() &&
                      privileges.technical?.viewReport !== 'none';
            }
         },
         socket
      );

      await logAudit(req, {
         entityType: 'project', entityId: technicalProject._id, entityLabel: jobNumber?.toString(),
         action: 'created', summary: `Job assigned to ${`${engineer.firstName || ''} ${engineer.lastName || ''}`.trim()} as ${projectType}`,
         changes: [{ label: 'Priority', to: priority }],
      });

      return res.status(201).json({
         success: true,
         message: "Project created and engineer assigned successfully",
         data: populatedProject
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to assign engineer",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const token = req.user;
      const userData = await getEmployeeData(token);
      if (!userData) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }

      const privileges = userData.category?.privileges;
      if (!privileges?.technical?.canViewOpenToWorkAndAssign) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to assign projects to engineers",
         });
      }

      const assignedBy = userData._id;
      const { engineerId, comment, projectType, customerId, priority, estimatedCostForProject } = req.body;
      if (!engineerId || !customerId || !['project', 'amc'].includes(projectType) || !['High', 'Medium', 'Low'].includes(priority)) {
         return res.status(400).json({
            success: false,
            message: "Customer, project type, engineer and priority are required",
         });
      }
      const customerGuard = await getCustomerCommercialGuard(customerId);
      if (customerGuard.blocked) {
         return res.status(409).json({
            success: false,
            message: customerGuard.message
         });
      }

      const technicalProject = await technicalModel.create({
         estimatedCostForProject: Number(estimatedCostForProject) > 0 ? Number(estimatedCostForProject) : 0,
         assignedTo: engineerId,
         comment,
         assignedBy,
         projectType,
         customer: customerId,
         assignedAt: new Date(),
         status: 'Pending',
         priority
      });

      const populatedProject = await technicalModel.findById(technicalProject._id)
         .populate('assignedTo', 'firstName lastName employeeId')
         .populate('assignedBy', 'firstName lastName')
         .populate('customer', 'companyName')

      await logAudit(req, {
         entityType: 'project', entityId: technicalProject._id,
         action: 'created', summary: `${projectType === 'amc' ? 'AMC' : 'Project'} created and assigned`,
         changes: [{ label: 'Priority', to: priority }],
      });

      return res.status(201).json({
         success: true,
         message: "Project created successfully",
         data: populatedProject
      });

   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to create project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

const PROJECT_GRID_FIELDS: GridFieldMap = {
   jobId: { path: 'jobId.jobId' },
   customer: { path: 'customer.companyName' },
   assignedTo: { path: 'assignedTo.fullName' },
   assignedBy: { path: 'assignedBy.fullName' },
   priority: { path: 'priority' },
};

export const getProjects = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { companyName, jobId, assignedTo, assignedToId, assignedBy, priority, row, page, projectType, status, search, filters, sortKey, sortDir } = req.body;

      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }

      const privileges = employee.category?.privileges;
      const accessFilter = privileges?.technical?.viewReport && privileges.technical.viewReport !== 'none'
         ? await buildPrivilegeAccessFilter(employee._id, privileges.technical.viewReport, 'assignedBy')
         : {};

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
            $unwind: {
               path: "$jobId",
               preserveNullAndEmptyArrays: true
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

      if (assignedToId === 'me') {
         matchConditions["assignedTo._id"] = employee._id;
      }

      if (typeof search === 'string' && search.trim()) {
         const searchRegex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
         matchConditions["$and"] = [
            ...(matchConditions["$and"] || []),
            {
               "$or": [
                  { "customer.companyName": searchRegex },
                  { "jobId.jobId": searchRegex },
                  { "assignedTo.fullName": searchRegex },
                  { "assignedBy.fullName": searchRegex }
               ]
            }
         ];
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

      if (Object.keys(accessFilter).length > 0) {
         // Scope by privilege, but an engineer always sees projects assigned to them.
         pipeline.push({ $match: { $or: [accessFilter, { 'assignedTo._id': employee._id }] } });
      }

      const gridMatch = buildGridFilterMatch(filters, PROJECT_GRID_FIELDS);
      if (gridMatch) pipeline.push({ $match: gridMatch });

      const countPipeline = [...pipeline];
      countPipeline.push({ $count: "total" });

      pipeline.push({ $sort: buildGridSort(sortKey, sortDir, PROJECT_GRID_FIELDS, { updatedAt: -1 }) });

      const totalResult = await technicalModel.aggregate(countPipeline);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      pipeline.push({
         $skip: (page - 1) * row
      });
      pipeline.push({
         $limit: row
      });

      const projects = await technicalModel.aggregate(pipeline);

      return res.status(200).json({
         success: true,
         message: projects.length > 0 ? "Projects fetched successfully" : "No projects found",
         data: projects,
         total: total
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
            $unwind: {
               path: "$jobId",
               preserveNullAndEmptyArrays: true
            }
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
            $unwind: {
               path: "$quotation",
               preserveNullAndEmptyArrays: true
            }
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
                  $cond: {
                     if: { $ne: ["$quotation", null] },
                     then: {
                        $let: {
                           vars: {
                              baseLpoValue: {
                                 $sum: {
                                    $cond: [
                                       { $eq: [{ $ifNull: ['$quotation.dealData.currency', '$quotation.currency'] }, 'USD'] },
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
                     else: 0
                  }
               },
               professionalServiceCharge: {
                  $cond: {
                     if: { $ne: ["$estimatedCostForProject", null] },
                     then: {
                        $round: [
                           {
                              $multiply: [
                                 { $ifNull: ["$estimatedCostForProject", 0] },
                                 0.2
                              ]
                           },
                           2
                        ]
                     },
                     else: 0
                  }
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
               estimatedCostForProject: { $ifNull: ["$estimatedCostForProject", 0] },
               professionalServiceCharge: 1,
               totalAmountClaimedForManpower: 1
            }
         }
      ])

      console.log(technical);

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

/**
 * Material request lines already on a live PO (anything but Draft, Rejected or Cancelled): MR line id -> the PO holding it.
 * Such a line cannot change until that PO is rejected or cancelled.
 */
const mrLinePoLocks = async (jobId: any): Promise<Record<string, string>> => {
   const locks: Record<string, string> = {};
   if (!jobId || !mongoose.Types.ObjectId.isValid(String(jobId))) return locks;
   const prs: any[] = await purchaseRequestModel.find({ jobId, 'items.itemDetails.mrLineId': { $exists: true, $ne: '' } }).select('items').lean();
   for (const pr of prs) {
      const usage = await poLineUsage(pr._id, pr.items);
      for (const item of pr.items || []) {
         for (const d of item.itemDetails || []) {
            const u = d.mrLineId ? usage.get(String(d._id)) : undefined;
            if (u) locks[String(d.mrLineId)] = u.po;
         }
      }
   }
   return locks;
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
            $unwind: {
               path: "$jobId",
               preserveNullAndEmptyArrays: true
            }
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
            $unwind: {
               path: "$jobId.quotation",
               preserveNullAndEmptyArrays: true
            }
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
            $unwind: {
               path: "$jobId.quotation.createdBy",
               preserveNullAndEmptyArrays: true
            }
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
         project[0].mrLockedLines = await mrLinePoLocks(project[0].jobId?._id);
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
      const { status, priority, projectType, materialRequest, supervisors, notes, involvedPersons, estimations, jobId, estimatedCostForProject } = req.body;

      const updateData: any = { status, priority, projectType, materialRequest, supervisors, notes, involvedPersons, estimations, jobId };
      
      if (estimatedCostForProject !== undefined) {
         updateData.estimatedCostForProject = estimatedCostForProject !== null && estimatedCostForProject !== '' 
            ? parseFloat(estimatedCostForProject.toString()) || 0 
            : 0;
      }

      const project = await technicalModel.findByIdAndUpdate(id, updateData, { new: true });
      await logAudit(req, { entityType: 'project', entityId: id, action: 'updated', summary: 'Project details updated' });

      return res.status(200).json({
         success: true,
         message: "Project updated successfully",
         data: project
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to update project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const transferEngineer = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { projectId, engineerId } = req.body;

      const tokenData = req.user;
      const employee = await getEmployeeData(tokenData);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Employee not found",
         });
      }

      const privileges = employee.category?.privileges;
      if (!privileges?.technical?.canTransferToEngineer) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to transfer engineers",
         });
      }

      if (!projectId || !engineerId) {
         return res.status(400).json({
            success: false,
            message: 'Project ID and engineer ID are required'
         });
      }

      const engineer = await employeeModel.findById(engineerId);
      if (!engineer) {
         return res.status(404).json({
            success: false,
            message: 'Engineer not found'
         });
      }

      const project = await technicalModel.findByIdAndUpdate(
         projectId,
         {
            assignedTo: engineerId,
            updatedAt: new Date()
         },
         {
            new: true
         }
      ).populate('assignedTo', 'firstName lastName employeeId')
       .populate('assignedBy', 'firstName lastName')
       .populate('customer', 'companyName')
       .populate('jobId', 'jobId');

      if (!project) {
         return res.status(404).json({
            success: false,
            message: 'Project not found'
         });
      }

      // Keep a started Project on the new engineer, and give a rejected job back to them as Pending.
      await projectModel.updateOne({ technical: projectId }, { assignedTo: engineerId });
      await technicalModel.updateOne({ _id: projectId, status: 'Rejected' }, { status: 'Pending', $unset: { rejectReason: 1 } });
      const startedProject = await projectModel.findOne({ technical: projectId }).select('projectNumber');
      await logAudit(req, {
         entityType: 'project',
         entityId: projectId,
         entityLabel: startedProject?.projectNumber || (project as any)?.jobId?.jobId,
         action: 'reassigned',
         summary: `Project transferred to ${engineer.firstName || ''} ${engineer.lastName || ''}`.trim(),
         changes: [{ label: 'Engineer', to: `${engineer.firstName || ''} ${engineer.lastName || ''}`.trim() }],
      });

      const jobNumber = (project as any)?.jobId?.jobId || '';
      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'TechnicalAssigned',
            referenceModel: 'Technical',
            title: 'Technical Project Transferred',
            message: `Technical project of job ${jobNumber} has been transferred to you`,
            sentBy: employee._id?.toString(),
            referenceId: project._id,
            additionalData: { projectId: project._id.toString() }
         },
         {
            privilegeKey: 'technical',
            checkFunction: (privileges, empId) => {
               return empId === engineerId.toString() &&
                      privileges.technical?.viewReport !== 'none';
            }
         },
         socket
      );

      return res.status(200).json({
         success: true,
         message: 'Engineer transferred successfully',
         data: project
      });

   } catch (error) {
      next(error);
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
         await logAudit(req, { entityType: 'project', entityId: id, action: 'task-added', summary: `Task added: ${taskName}` });
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
            await logAudit(req, { entityType: 'project', entityId: id, action: 'task-updated', summary: `Task updated: ${taskName}` });
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
      const { 
         activityName, 
         status, 
         expectedStartDateFrom, 
         expectedStartDateTo,
         expectedEndDateFrom,
         expectedEndDateTo,
         actualStartDateFrom,
         actualStartDateTo,
         actualEndDateFrom,
         actualEndDateTo
      } = req.query;
      
      const technical = await technicalModel.findById(id, { activityPlan: 1 }).populate('activityPlan.includedEmployees');
      if (technical) {
         let filteredPlans = technical.activityPlan || [];

         if (activityName) {
            const searchRegex = new RegExp(activityName as string, 'i');
            filteredPlans = filteredPlans.filter((plan: any) => 
               plan.activityName && searchRegex.test(plan.activityName)
            );
         }

         if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            filteredPlans = filteredPlans.filter((plan: any) => 
               plan.status && statusArray.includes(plan.status)
            );
         }

         if (expectedStartDateFrom || expectedStartDateTo) {
            filteredPlans = filteredPlans.filter((plan: any) => {
               if (!plan.startDate) return false;
               
               const planStartDate = new Date(plan.startDate);
               planStartDate.setHours(0, 0, 0, 0);
               
               if (expectedStartDateFrom && expectedStartDateTo) {
                  const from = new Date(expectedStartDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  const to = new Date(expectedStartDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planStartDate >= from && planStartDate <= to;
               } else if (expectedStartDateFrom) {
                  const from = new Date(expectedStartDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  return planStartDate >= from;
               } else if (expectedStartDateTo) {
                  const to = new Date(expectedStartDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planStartDate <= to;
               }
               return true;
            });
         }

         if (expectedEndDateFrom || expectedEndDateTo) {
            filteredPlans = filteredPlans.filter((plan: any) => {
               if (!plan.endDate) return false;
               
               const planEndDate = new Date(plan.endDate);
               planEndDate.setHours(0, 0, 0, 0);
               
               if (expectedEndDateFrom && expectedEndDateTo) {
                  const from = new Date(expectedEndDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  const to = new Date(expectedEndDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planEndDate >= from && planEndDate <= to;
               } else if (expectedEndDateFrom) {
                  const from = new Date(expectedEndDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  return planEndDate >= from;
               } else if (expectedEndDateTo) {
                  const to = new Date(expectedEndDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planEndDate <= to;
               }
               return true;
            });
         }

         if (actualStartDateFrom || actualStartDateTo) {
            filteredPlans = filteredPlans.filter((plan: any) => {
               if (!plan.orginalStartDate) return false;
               
               const planActualStartDate = new Date(plan.orginalStartDate);
               planActualStartDate.setHours(0, 0, 0, 0);
               
               if (actualStartDateFrom && actualStartDateTo) {
                  const from = new Date(actualStartDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  const to = new Date(actualStartDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planActualStartDate >= from && planActualStartDate <= to;
               } else if (actualStartDateFrom) {
                  const from = new Date(actualStartDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  return planActualStartDate >= from;
               } else if (actualStartDateTo) {
                  const to = new Date(actualStartDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planActualStartDate <= to;
               }
               return true;
            });
         }

         if (actualEndDateFrom || actualEndDateTo) {
            filteredPlans = filteredPlans.filter((plan: any) => {
               if (!plan.orginalEndDate) return false;
               
               const planActualEndDate = new Date(plan.orginalEndDate);
               planActualEndDate.setHours(0, 0, 0, 0);
               
               if (actualEndDateFrom && actualEndDateTo) {
                  const from = new Date(actualEndDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  const to = new Date(actualEndDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planActualEndDate >= from && planActualEndDate <= to;
               } else if (actualEndDateFrom) {
                  const from = new Date(actualEndDateFrom as string);
                  from.setHours(0, 0, 0, 0);
                  return planActualEndDate >= from;
               } else if (actualEndDateTo) {
                  const to = new Date(actualEndDateTo as string);
                  to.setHours(23, 59, 59, 999);
                  return planActualEndDate <= to;
               }
               return true;
            });
         }

         return res.status(200).json({
            success: true,
            message: "Activity plans fetched successfully",
            data: filteredPlans
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


export const updateMaterialRequest = async (req: any, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      let materialRequest = req.body.materialRequest;
      
      if (typeof materialRequest === 'string') {
         materialRequest = JSON.parse(materialRequest);
      }

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
         console.log(item)

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

      let attachmentFiles = [];
      if (req.files?.attachments) {
         const files = Array.isArray(req.files.attachments) ? req.files.attachments : [req.files.attachments];
         attachmentFiles = await Promise.all(files.map(async (file: any) => {
            await uploadFileToAws(file.filename, file.path);
            return { fileName: file.filename, originalname: file.originalname };
         }));
      }

      let existingAttachments = [];
      if (req.body.existingAttachments) {
         const existingAttachmentsStr = typeof req.body.existingAttachments === 'string' 
            ? req.body.existingAttachments 
            : JSON.stringify(req.body.existingAttachments);
         existingAttachments = JSON.parse(existingAttachmentsStr);
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      // A line on a live PO stays as it is until that PO is rejected or cancelled.
      const locks = await mrLinePoLocks(technical.jobId);
      for (const existing of technical.materialRequest as any[]) {
         const po = locks[String(existing._id)];
         if (!po) continue;
         const next = materialRequest.find((m: any) => String(m._id) === String(existing._id));
         const name = `"${existing.itemName}"`;
         if (!next) {
            return res.status(409).json({ success: false, message: `${name} is on ${po} and cannot be removed. Reject that PO if it is pending, or cancel it if it is placed or approved, first.` });
         }
         const changed = String(next.itemName || '').trim() !== existing.itemName
            || Number(next.quantity) !== Number(existing.quantity)
            || Number(next.estimatedCost) !== Number(existing.estimatedCost);
         if (changed) {
            return res.status(409).json({ success: false, message: `${name} is on ${po}, so it cannot be edited. Reject that PO if it is pending, or cancel it if it is placed or approved, first.` });
         }
      }

      const sanitizedMaterialRequest = materialRequest.map((item: any, index: number) => {
         const existingItem: any = item._id ? (technical.materialRequest as any[]).find((e: any) => String(e._id) === String(item._id)) : undefined;
         return {
            // Keep the line's id: PR lines point back to it.
            ...(existingItem ? { _id: existingItem._id } : {}),
            productId: item.productId && mongoose.Types.ObjectId.isValid(item.productId) ? item.productId : undefined,
            itemCode: typeof item.itemCode === 'string' ? item.itemCode.trim() : '',
            partNo: typeof item.partNo === 'string' ? item.partNo.trim() : '',
            uom: typeof item.uom === 'string' ? item.uom.trim() : '',
            itemName: item.itemName.trim(),
            quantity: Number(item.quantity),
            estimatedCost: Number(item.estimatedCost),
            requiredOn: new Date(item.requiredOn),
            remarks: item.remarks ? item.remarks.trim() : '',
            status: existingItem?.status || item.status || 'pending',
            statusHistory: existingItem?.statusHistory || item.statusHistory || []
         };
      });

      const sanitizedAttachments = existingAttachments.map((attachment: any) => {
         const existingFile = technical.materialRequestAttachements.find(
            (f: any) => f.fileName === attachment.fileName && f.originalname === attachment.originalname
         );
         return {
            fileName: attachment.fileName,
            originalname: attachment.originalname,
            status: existingFile?.status || attachment.status || 'pending',
            statusHistory: existingFile?.statusHistory || attachment.statusHistory || []
         };
      });

      const newAttachments = attachmentFiles.map((file: any) => ({
         fileName: file.fileName || file.filename,
         originalname: file.originalname,
         status: 'pending' as const,
         statusHistory: [] as any[]
      }));

      technical.materialRequest = sanitizedMaterialRequest;
      technical.materialRequestAttachements = [...sanitizedAttachments, ...newAttachments];
      technical.updatedAt = new Date();
      await technical.save();

      const employee = await getEmployeeData(req.user);
      if (employee) {
         const socket = req.app.get('io') as Server;
         await createNotificationWithPrivileges(
            {
               type: 'MrApprovalRequest',
               referenceModel: 'Technical',
               title: 'Material Request Submitted For Approval',
               message: 'A material request has been submitted for approval',
               sentBy: employee._id?.toString(),
               referenceId: technical._id,
               additionalData: { technicalId: technical._id.toString() }
            },
            {
               privilegeKey: 'technical',
               checkFunction: (privileges) => {
                  return privileges.technical?.canApproveMRRequests === true;
               }
            },
            socket
         );
      }

      await logAudit(req, { entityType: 'project', entityId: id, action: 'material-request-updated', summary: 'Material request saved' });
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
                                 { $eq: [{ $ifNull: ['$quotation.dealData.currency', '$quotation.currency'] }, 'USD'] },
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

export const getMrRequests = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { engineer, jobId,requestedBy, purchaseNo, message,fromDate,toDate , row, page } = req.body;


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
               localField: "customerId",
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
               localField: "createdBy",
               foreignField: "_id",
               as: "createdBy"
            }
         },
         {
            $unwind: "$createdBy"
         },
         {
            $addFields: {
               "createdBy.fullName": {
                  $concat: ["$createdBy.firstName", " ", "$createdBy.lastName"]
               }
            }
         },
         {
            $lookup: {
               from: "employees",
               localField: "updatedBy",
               foreignField: "_id",
               as: "updatedBy"
            }
         },
         {
            $unwind: {
               path: "$updatedBy",
               preserveNullAndEmptyArrays: true
            }
         },
         {
            $lookup: {
               from: "employees",
               localField: "mrRequest.engineer",
               foreignField: "_id",
               as: "mrRequest.engineer"
            }
         },
         {
            $unwind: {
               path: "$mrRequest.engineer",
               preserveNullAndEmptyArrays: true
            }
         },
         {
            $addFields: {
               "updatedBy.fullName": {
                  $concat: ["$updatedBy.firstName", " ", "$updatedBy.lastName"]
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

      const matchConditions: any = {
         isDeleted: false
      };

      if (engineer) {
         matchConditions["mrRequest.engineer"] = { $regex: engineer, $options: 'i' };
      }

      if (jobId) {
         matchConditions["jobId.jobId"] = { $regex: jobId, $options: 'i' };
      }

      if (purchaseNo) {
         matchConditions.purchaseNo = { $regex: purchaseNo, $options: 'i' };
      }

      if (message) {
         matchConditions["mrRequest.message"] = { $regex: message, $options: 'i' };
      }


       if (fromDate && !toDate) {
         const { startOfDay, endOfDay } = getDateRangeByDay(fromDate);
         matchConditions["mrRequest.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
      }

      if (fromDate && toDate) {
         const fromDateObj = new Date(fromDate);
         const toDateObj = new Date(toDate);
         if (fromDateObj.toDateString() === toDateObj.toDateString()) {
            const { startOfDay, endOfDay } = getDateRangeByDay(fromDate);
            matchConditions["mrRequest.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
         } else {
            const { startOfDay, endOfDay } = getDateRangeByDay(fromDate, toDate);
            matchConditions["mrRequest.createdDate"] = { $gte: startOfDay, $lte: endOfDay };
         }
      }

      if (requestedBy) {
         matchConditions["$or"] = [
            { "createdBy.firstName": { $regex: requestedBy, $options: 'i' } },
            { "createdBy.lastName": { $regex: requestedBy, $options: 'i' } },
            { "createdBy.fullName": { $regex: requestedBy, $options: 'i' } }
         ];
      }

      if (Object.keys(matchConditions).length > 1) { // > 1 because isDeleted is always there
         pipeline.push({ $match: matchConditions });
      } else {
         pipeline.push({ $match: { isDeleted: false } });
      }

      const countPipeline = [...pipeline];
      countPipeline.pop();
      countPipeline.pop();
      countPipeline.push({ $count: "total" });

      const totalResult = await purchaseRequestModel.aggregate(countPipeline);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      const mrRequests = await purchaseRequestModel.aggregate(pipeline);

      return res.status(200).json({
         success: true,
         message: mrRequests.length > 0 ? "MR Requests fetched successfully" : "No MR requests found",
         data: mrRequests,
         total: total
      });
   } catch (error) {
      console.log(error)
      return res.status(500).json({
         success: false,
         message: "Failed to get MR requests",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};


export const getMaterialRequestByJobId = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { jobId } = req.params;
      const technicalProject = await technicalModel.findOne({ jobId: new ObjectId(jobId) });
      if(!technicalProject){
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }
      const materialRequest = technicalProject.materialRequest;
      const materialRequestAttachements = technicalProject.materialRequestAttachements;
      return res.status(200).json({
         success: true,
         message: "Material request fetched successfully",
         data: materialRequest,
         files: materialRequestAttachements
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to get material request by job ID",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

const MATERIAL_GRID_FIELDS: GridFieldMap = {
   jobId: { path: 'jobId.jobId' },
   customer: { path: 'customer.companyName' },
   materialRequest: { path: 'itemCount', type: 'number' },
   materialRequestAttachments: { path: 'fileCount', type: 'number' },
   updatedAt: { path: 'updatedAt', type: 'date' },
};

export const getPendingMaterialRequestProjects = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { page = 1, row = 10, search, filters, sortKey, sortDir, viewId = 'pending' } = req.body;
      const pageNumber = Number(page) || 1;
      const pageSize = Number(row) || 10;
      const skip = (pageNumber - 1) * pageSize;
      const requestView = ['all', 'pending', 'approved'].includes(viewId) ? viewId : 'pending';

      const pipeline: any[] = [
         {
            $lookup: {
               from: 'jobs',
               localField: 'jobId',
               foreignField: '_id',
               as: 'jobId'
            }
         },
         {
            $unwind: {
               path: '$jobId',
               preserveNullAndEmptyArrays: true
            }
         },
         {
            $lookup: {
               from: 'customers',
               localField: 'customer',
               foreignField: '_id',
               as: 'customer'
            }
         },
         {
            $unwind: {
               path: '$customer',
               preserveNullAndEmptyArrays: true
            }
         },
         {
            $addFields: {
               hasPendingItems: {
                  $cond: {
                     if: { $isArray: '$materialRequest' },
                     then: {
                        $anyElementTrue: {
                           $map: {
                              input: '$materialRequest',
                              as: 'item',
                              in: { $eq: [{ $ifNull: ['$$item.status', 'pending'] }, 'pending'] }
                           }
                        }
                     },
                     else: false
                  }
               },
               hasPendingFiles: {
                  $cond: {
                     if: { $isArray: '$materialRequestAttachements' },
                     then: {
                        $anyElementTrue: {
                           $map: {
                              input: '$materialRequestAttachements',
                              as: 'file',
                              in: { $eq: [{ $ifNull: ['$$file.status', 'pending'] }, 'pending'] }
                           }
                        }
                     },
                     else: false
                  }
               },
               hasApprovedItems: {
                  $cond: {
                     if: { $isArray: '$materialRequest' },
                     then: {
                        $anyElementTrue: {
                           $map: {
                              input: '$materialRequest',
                              as: 'item',
                              in: { $eq: [{ $ifNull: ['$$item.status', 'pending'] }, 'approved'] }
                           }
                        }
                     },
                     else: false
                  }
               },
               hasApprovedFiles: {
                  $cond: {
                     if: { $isArray: '$materialRequestAttachements' },
                     then: {
                        $anyElementTrue: {
                           $map: {
                              input: '$materialRequestAttachements',
                              as: 'file',
                              in: { $eq: [{ $ifNull: ['$$file.status', 'pending'] }, 'approved'] }
                           }
                        }
                     },
                     else: false
                  }
               },
               hasMaterialRequests: {
                  $or: [
                     { $gt: [{ $size: { $ifNull: ['$materialRequest', []] } }, 0] },
                     { $gt: [{ $size: { $ifNull: ['$materialRequestAttachements', []] } }, 0] }
                  ]
               }
            }
         }
      ];

      if (requestView === 'pending') {
         pipeline.push({
            $match: {
               $or: [
                  { hasPendingItems: true },
                  { hasPendingFiles: true }
               ]
            }
         });
      } else if (requestView === 'approved') {
         pipeline.push({
            $match: {
               $and: [
                  { hasMaterialRequests: true },
                  { hasPendingItems: false },
                  { hasPendingFiles: false },
                  {
                     $or: [
                        { hasApprovedItems: true },
                        { hasApprovedFiles: true }
                     ]
                  }
               ]
            }
         });
      } else {
         pipeline.push({
            $match: { hasMaterialRequests: true }
         });
      }

      if (typeof search === 'string' && search.trim()) {
         const searchRegex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
         pipeline.push({ $match: { $or: [{ 'jobId.jobId': searchRegex }, { 'customer.companyName': searchRegex }] } });
      }

      pipeline.push({
         $addFields: {
            itemCount: { $size: { $ifNull: ['$materialRequest', []] } },
            fileCount: { $size: { $ifNull: ['$materialRequestAttachements', []] } }
         }
      });

      const gridMatch = buildGridFilterMatch(filters, MATERIAL_GRID_FIELDS);
      if (gridMatch) pipeline.push({ $match: gridMatch });

      const countPipeline = [...pipeline, { $count: 'total' }];

      pipeline.push(
         { $sort: buildGridSort(sortKey, sortDir, MATERIAL_GRID_FIELDS, { updatedAt: -1 }) },
         {
            $project: {
               _id: 1,
               jobId: {
                  _id: '$jobId._id',
                  jobId: '$jobId.jobId'
               },
               customer: {
                  _id: '$customer._id',
                  companyName: '$customer.companyName'
               },
               materialRequest: 1,
               materialRequestAttachements: 1,
               projectType: 1,
               status: 1,
               priority: 1,
               updatedAt: 1
            }
         },
         { $skip: skip },
         { $limit: pageSize }
      );

      const projects = await technicalModel.aggregate(pipeline);

      const totalResult = await technicalModel.aggregate(countPipeline);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      return res.status(200).json({
         success: true,
         data: projects,
         total: total
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to get pending material request projects",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const approveMaterialRequest = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { comment = '' } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const privileges = employee.category?.privileges;
      if (!privileges?.technical?.canApproveMRRequests) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to approve MR requests",
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      const historyEntry = {
         status: 'approved' as const,
         comment: comment || '',
         changedBy: employee._id,
         changedDate: new Date()
      };

      technical.materialRequest = technical.materialRequest.map((item: any) => {
         if (item.status === 'pending') {
            return {
               ...item,
               status: 'approved',
               statusHistory: [...(item.statusHistory || []), historyEntry]
            };
         }
         return item;
      });

      technical.materialRequestAttachements = technical.materialRequestAttachements.map((file: any) => {
         if (file.status === 'pending') {
            return {
               ...file,
               status: 'approved',
               statusHistory: [...(file.statusHistory || []), historyEntry]
            };
         }
         return file;
      });

      technical.updatedAt = new Date();
      await technical.save();

      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'MrApproved',
            referenceModel: 'Technical',
            title: 'Material Request Approved',
            message: 'Material request has been approved and is ready for purchase processing',
            sentBy: employee._id?.toString(),
            referenceId: technical._id,
            additionalData: { jobId: technical.jobId?.toString() }
         },
         {
            privilegeKey: 'purchase',
            checkFunction: (privileges) => {
               return privileges.purchase?.create === true;
            }
         },
         socket
      );

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'material-request-approved', summary: 'Material request approved' });
      return res.status(200).json({
         success: true,
         message: "Material request approved successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to approve material request",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const rejectMaterialRequest = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { comment = '' } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      if (!comment || comment.trim().length === 0) {
         return res.status(400).json({
            success: false,
            message: "Comment is required for rejection"
         });
      }

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      const historyEntry = {
         status: 'rejected' as const,
         comment: comment.trim(),
         changedBy: employee._id,
         changedDate: new Date()
      };

      technical.materialRequest = technical.materialRequest.map((item: any) => {
         if (item.status === 'pending') {
            return {
               itemName: item.itemName,
               quantity: item.quantity,
               estimatedCost: item.estimatedCost,
               requiredOn: item.requiredOn instanceof Date ? item.requiredOn : new Date(item.requiredOn),
               remarks: item.remarks || '',
               status: 'rejected' as const,
               statusHistory: [...(item.statusHistory || []), historyEntry]
            };
         }
         return {
            itemName: item.itemName,
            quantity: item.quantity,
            estimatedCost: item.estimatedCost,
            requiredOn: item.requiredOn instanceof Date ? item.requiredOn : new Date(item.requiredOn),
            remarks: item.remarks || '',
            status: item.status || 'pending',
            statusHistory: item.statusHistory || []
         };
      });

      technical.materialRequestAttachements = technical.materialRequestAttachements.map((file: any) => {
         if (file.status === 'pending') {
            return {
               fileName: file.fileName,
               originalname: file.originalname,
               status: 'rejected' as const,
               statusHistory: [...(file.statusHistory || []), historyEntry]
            };
         }
         return {
            fileName: file.fileName,
            originalname: file.originalname,
            status: file.status || 'pending',
            statusHistory: file.statusHistory || []
         };
      });

      technical.updatedAt = new Date();
      await technical.save();

      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'MrRejected',
            referenceModel: 'Technical',
            title: 'Material Request Rejected',
            message: 'Your material request has been rejected',
            sentBy: employee._id?.toString(),
            referenceId: technical._id,
            additionalData: { technicalId: technical._id.toString() }
         },
         {
            privilegeKey: 'technical',
            checkFunction: (privileges, employeeId) => {
               return employeeId === technical.assignedTo?.toString() &&
                      privileges.technical?.viewReport !== 'none';
            }
         },
         socket
      );

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'material-request-rejected', summary: 'Material request rejected' });
      return res.status(200).json({
         success: true,
         message: "Material request rejected successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to reject material request",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const approveMaterialRequestItem = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, itemIndex } = req.params;
      const { comment = '' } = req.body;

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const privileges = employee.category?.privileges;
      if (!privileges?.technical?.canApproveMRRequests) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to approve MR requests",
         });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const index = parseInt(itemIndex);
      if (isNaN(index) || index < 0) {
         return res.status(400).json({
            success: false,
            message: "Invalid item index"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      if (!technical.materialRequest || index >= technical.materialRequest.length) {
         return res.status(404).json({
            success: false,
            message: "Item not found"
         });
      }

      const item = technical.materialRequest[index];
      if (!item || item.status !== 'pending') {
         return res.status(400).json({
            success: false,
            message: `Item is not pending. Current status: ${item?.status || 'unknown'}`
         });
      }

      const historyEntry = {
         status: 'approved' as const,
         comment: comment || '',
         changedBy: employee._id,
         changedDate: new Date()
      };

      const itemData: any = JSON.parse(JSON.stringify(item));
      
      technical.materialRequest[index] = {
         itemName: itemData.itemName,
         quantity: itemData.quantity,
         estimatedCost: itemData.estimatedCost,
         requiredOn: itemData.requiredOn instanceof Date ? itemData.requiredOn : new Date(itemData.requiredOn),
         remarks: itemData.remarks || '',
         status: 'approved',
         statusHistory: [...(itemData.statusHistory || []), historyEntry]
      };

      technical.updatedAt = new Date();
      await technical.save();

      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'MrApproved',
            referenceModel: 'Technical',
            title: 'Material Request Approved',
            message: 'Material request item has been approved and is ready for purchase processing',
            sentBy: employee._id?.toString(),
            referenceId: technical._id,
            additionalData: { jobId: technical.jobId?.toString() }
         },
         {
            privilegeKey: 'purchase',
            checkFunction: (privileges) => {
               return privileges.purchase?.create === true;
            }
         },
         socket
      );

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'mr-item-approved', summary: 'Material request item approved' });
      return res.status(200).json({
         success: true,
         message: "Item approved successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to approve item",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const rejectMaterialRequestItem = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, itemIndex } = req.params;
      const { comment = '' } = req.body;

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const privileges = employee.category?.privileges;
      if (!privileges?.technical?.canApproveMRRequests) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to approve MR requests",
         });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      if (!comment || comment.trim().length === 0) {
         return res.status(400).json({
            success: false,
            message: "Comment is required for rejection"
         });
      }

      const index = parseInt(itemIndex);
      if (isNaN(index) || index < 0) {
         return res.status(400).json({
            success: false,
            message: "Invalid item index"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      if (!technical.materialRequest || index >= technical.materialRequest.length) {
         return res.status(404).json({
            success: false,
            message: "Item not found"
         });
      }

      const item = technical.materialRequest[index];
      if (!item || item.status !== 'pending') {
         return res.status(400).json({
            success: false,
            message: `Item is not pending. Current status: ${item?.status || 'unknown'}`
         });
      }

      const historyEntry = {
         status: 'rejected' as const,
         comment: comment.trim(),
         changedBy: employee._id,
         changedDate: new Date()
      };

      const itemData: any = JSON.parse(JSON.stringify(item));
      
      technical.materialRequest[index] = {
         itemName: itemData.itemName,
         quantity: itemData.quantity,
         estimatedCost: itemData.estimatedCost,
         requiredOn: itemData.requiredOn instanceof Date ? itemData.requiredOn : new Date(itemData.requiredOn),
         remarks: itemData.remarks || '',
         status: 'rejected',
         statusHistory: [...(itemData.statusHistory || []), historyEntry]
      };

      technical.updatedAt = new Date();
      await technical.save();

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'mr-item-rejected', summary: 'Material request item rejected' });
      return res.status(200).json({
         success: true,
         message: "Item rejected successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to reject item",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const approveMaterialRequestFile = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, fileIndex } = req.params;
      const { comment = '' } = req.body;

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const privileges = employee.category?.privileges;
      if (!privileges?.technical?.canApproveMRRequests) {
         return res.status(403).json({
            success: false,
            message: "You do not have permission to approve MR requests",
         });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const index = parseInt(fileIndex);
      if (isNaN(index) || index < 0) {
         return res.status(400).json({
            success: false,
            message: "Invalid file index"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      if (!technical.materialRequestAttachements || index >= technical.materialRequestAttachements.length) {
         return res.status(404).json({
            success: false,
            message: "File not found"
         });
      }

      const file = technical.materialRequestAttachements[index];
      if (!file || file.status !== 'pending') {
         return res.status(400).json({
            success: false,
            message: `File is not pending. Current status: ${file?.status || 'unknown'}`
         });
      }

      const historyEntry = {
         status: 'approved' as const,
         comment: comment || '',
         changedBy: employee._id,
         changedDate: new Date()
      };

      const fileData: any = JSON.parse(JSON.stringify(file));
      
      technical.materialRequestAttachements[index] = {
         fileName: fileData.fileName,
         originalname: fileData.originalname,
         status: 'approved',
         statusHistory: [...(fileData.statusHistory || []), historyEntry]
      };

      technical.updatedAt = new Date();
      await technical.save();

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'mr-file-approved', summary: 'Material request file approved' });
      return res.status(200).json({
         success: true,
         message: "File approved successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to approve file",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const rejectMaterialRequestFile = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id, fileIndex } = req.params;
      const { comment = '' } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      if (!comment || comment.trim().length === 0) {
         return res.status(400).json({
            success: false,
            message: "Comment is required for rejection"
         });
      }

      const index = parseInt(fileIndex);
      if (isNaN(index) || index < 0) {
         return res.status(400).json({
            success: false,
            message: "Invalid file index"
         });
      }

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      if (!technical.materialRequestAttachements || index >= technical.materialRequestAttachements.length) {
         return res.status(404).json({
            success: false,
            message: "File not found"
         });
      }

      const file = technical.materialRequestAttachements[index];
      if (!file || file.status !== 'pending') {
         return res.status(400).json({
            success: false,
            message: `File is not pending. Current status: ${file?.status || 'unknown'}`
         });
      }

      const historyEntry = {
         status: 'rejected' as const,
         comment: comment.trim(),
         changedBy: employee._id,
         changedDate: new Date()
      };

      const fileData: any = JSON.parse(JSON.stringify(file));
      
      technical.materialRequestAttachements[index] = {
         fileName: fileData.fileName,
         originalname: fileData.originalname,
         status: 'rejected',
         statusHistory: [...(fileData.statusHistory || []), historyEntry]
      };

      technical.updatedAt = new Date();
      await technical.save();

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'mr-file-rejected', summary: 'Material request file rejected' });
      return res.status(200).json({
         success: true,
         message: "File rejected successfully",
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to reject file",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

export const approveAllPendingMaterialRequests = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { id } = req.params;
      const { comment = '' } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
         return res.status(400).json({
            success: false,
            message: "Invalid technical project ID"
         });
      }

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
         });
      }

      const technical = await technicalModel.findById(id);
      if (!technical) {
         return res.status(404).json({
            success: false,
            message: "Technical project not found"
         });
      }

      const historyEntry = {
         status: 'approved' as const,
         comment: comment || '',
         changedBy: employee._id,
         changedDate: new Date()
      };

      let approvedItemsCount = 0;
      let approvedFilesCount = 0;

      technical.materialRequest = technical.materialRequest.map((item: any) => {
         const itemData: any = JSON.parse(JSON.stringify(item));
         if (itemData.status === 'pending') {
            approvedItemsCount++;
            return {
               itemName: itemData.itemName,
               quantity: itemData.quantity,
               estimatedCost: itemData.estimatedCost,
               requiredOn: itemData.requiredOn instanceof Date ? itemData.requiredOn : new Date(itemData.requiredOn),
               remarks: itemData.remarks || '',
               status: 'approved' as const,
               statusHistory: [...(itemData.statusHistory || []), historyEntry]
            };
         }
         return {
            itemName: itemData.itemName,
            quantity: itemData.quantity,
            estimatedCost: itemData.estimatedCost,
            requiredOn: itemData.requiredOn instanceof Date ? itemData.requiredOn : new Date(itemData.requiredOn),
            remarks: itemData.remarks || '',
            status: itemData.status || 'pending',
            statusHistory: itemData.statusHistory || []
         };
      });

      technical.materialRequestAttachements = technical.materialRequestAttachements.map((file: any) => {
         const fileData: any = JSON.parse(JSON.stringify(file));
         if (fileData.status === 'pending') {
            approvedFilesCount++;
            return {
               fileName: fileData.fileName,
               originalname: fileData.originalname,
               status: 'approved' as const,
               statusHistory: [...(fileData.statusHistory || []), historyEntry]
            };
         }
         return {
            fileName: fileData.fileName,
            originalname: fileData.originalname,
            status: fileData.status || 'pending',
            statusHistory: fileData.statusHistory || []
         };
      });

      if (approvedItemsCount === 0 && approvedFilesCount === 0) {
         return res.status(400).json({
            success: false,
            message: "No pending items or files to approve"
         });
      }

      technical.updatedAt = new Date();
      await technical.save();

      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
         {
            type: 'MrApproved',
            referenceModel: 'Technical',
            title: 'Material Request Approved',
            message: 'Material request has been approved and is ready for purchase processing',
            sentBy: employee._id?.toString(),
            referenceId: technical._id,
            additionalData: { jobId: technical.jobId?.toString() }
         },
         {
            privilegeKey: 'purchase',
            checkFunction: (privileges) => {
               return privileges.purchase?.create === true;
            }
         },
         socket
      );

      await logAudit(req, { entityType: 'project', entityId: technical._id, action: 'material-request-approved', summary: `Approved ${approvedItemsCount} item(s) and ${approvedFilesCount} file(s)` });
      return res.status(200).json({
         success: true,
         message: `Approved ${approvedItemsCount} item(s) and ${approvedFilesCount} file(s) successfully`,
         data: technical
      });
   } catch (error) {
      console.log(error);
      return res.status(500).json({
         success: false,
         message: "Failed to approve all pending items",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
}

// ---- engineer response (start / reject) and project lifecycle ----

// NR/PJ-mm-yy-seq, sequence restarts every month (shared counter from docNumber.service).
const nextProjectNumber = async (): Promise<string> => issueDocNo('PJ', 'NR');

/** The assigned engineer confirms the work: the assignment is approved and a Project is created. */
export const startProject = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
         return res.status(400).json({ success: false, message: "Invalid project ID" });
      }

      // Atomic Pending -> Approved so a double click cannot create two projects.
      const assignment = await technicalModel.findOneAndUpdate(
         { _id: id, status: 'Pending', assignedTo: employee._id },
         { status: 'Approved', respondedAt: new Date(), respondedBy: employee._id, updatedAt: new Date() },
         { new: true }
      );
      if (!assignment) {
         return res.status(409).json({
            success: false,
            message: "This project is not waiting for your response"
         });
      }

      try {
         const job = assignment.jobId ? await jobModel.findById(assignment.jobId).select('allocateType') : null;
         let project = null;
         for (let attempt = 0; attempt < 3 && !project; attempt++) {
            try {
               project = await projectModel.create({
                  projectNumber: await nextProjectNumber(),
                  technical: assignment._id,
                  jobId: assignment.jobId,
                  customer: assignment.customer,
                  projectType: assignment.projectType,
                  allocateType: (job as any)?.allocateType || '',
                  priority: assignment.priority,
                  assignedTo: assignment.assignedTo,
                  assignedBy: assignment.assignedBy,
                  assignedAt: assignment.assignedAt,
                  status: 'In Progress',
                  startedAt: new Date(),
                  startedBy: employee._id,
                  estimatedCostForProject: assignment.estimatedCostForProject || 0,
                  statusHistory: [{ status: 'In Progress', remarks: '', changedBy: employee._id, changedAt: new Date() }],
               });
            } catch (error: any) {
               // Duplicate projectNumber from a concurrent start: retry with a fresh number.
               if (error?.code !== 11000 || attempt === 2) throw error;
            }
         }

         await logAudit(req, {
            entityType: 'project', entityId: assignment._id, entityLabel: (project as any)?.projectNumber,
            action: 'started', summary: `Project ${(project as any)?.projectNumber || ''} started`.trim(),
            changes: [{ label: 'Status', to: 'In Progress' }],
         });
         return res.status(201).json({ success: true, message: "Project started successfully", data: project });
      } catch (error) {
         // Put the assignment back so the engineer can try again.
         await technicalModel.updateOne(
            { _id: assignment._id },
            { status: 'Pending', $unset: { respondedAt: 1, respondedBy: 1 } }
         );
         throw error;
      }
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to start project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

/** The assigned engineer declines the work; the assignment moves to the Rejected tab. */
export const rejectAssignment = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const { id } = req.params;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!mongoose.isValidObjectId(id)) {
         return res.status(400).json({ success: false, message: "Invalid project ID" });
      }
      if (!reason) {
         return res.status(400).json({ success: false, message: "A reason is required to reject" });
      }

      const assignment = await technicalModel.findOneAndUpdate(
         { _id: id, status: 'Pending', assignedTo: employee._id },
         { status: 'Rejected', rejectReason: reason, respondedAt: new Date(), respondedBy: employee._id, updatedAt: new Date() },
         { new: true }
      );
      if (!assignment) {
         return res.status(409).json({
            success: false,
            message: "This project is not waiting for your response"
         });
      }

      await logAudit(req, {
         entityType: 'project', entityId: assignment._id, action: 'rejected', summary: `Assignment rejected: ${reason}`,
      });
      return res.status(200).json({ success: true, message: "Project rejected", data: assignment });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to reject project",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

/** Started projects (In Progress / Completed / Lost), with the same grid contract as getProjects. */
export const getWorkProjects = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const { page = 1, row = 15, status, search, filters, sortKey, sortDir } = req.body;

      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const privileges = employee.category?.privileges;
      const accessFilter = privileges?.technical?.viewReport && privileges.technical.viewReport !== 'none'
         ? await buildPrivilegeAccessFilter(employee._id, privileges.technical.viewReport, 'assignedBy')
         : {};

      const pipeline: any[] = [
         { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", as: "jobId" } },
         { $unwind: { path: "$jobId", preserveNullAndEmptyArrays: true } },
         { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customer" } },
         { $unwind: "$customer" },
         { $lookup: { from: "employees", localField: "assignedTo", foreignField: "_id", as: "assignedTo" } },
         { $unwind: "$assignedTo" },
         { $addFields: { "assignedTo.fullName": { $concat: ["$assignedTo.firstName", " ", "$assignedTo.lastName"] } } },
         { $lookup: { from: "employees", localField: "assignedBy", foreignField: "_id", as: "assignedBy" } },
         { $unwind: "$assignedBy" },
         { $addFields: { "assignedBy.fullName": { $concat: ["$assignedBy.firstName", " ", "$assignedBy.lastName"] } } },
      ];

      const statuses = (Array.isArray(status) ? status : []).filter((s: string) => (PROJECT_STATUSES as readonly string[]).includes(s));
      if (statuses.length) {
         pipeline.push({ $match: { status: { $in: statuses } } });
      }

      if (typeof search === 'string' && search.trim()) {
         const searchRegex = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
         pipeline.push({
            $match: {
               $or: [
                  { projectNumber: searchRegex },
                  { "customer.companyName": searchRegex },
                  { "jobId.jobId": searchRegex },
                  { "assignedTo.fullName": searchRegex },
                  { "assignedBy.fullName": searchRegex },
               ]
            }
         });
      }

      if (Object.keys(accessFilter).length > 0) {
         pipeline.push({ $match: { $or: [accessFilter, { 'assignedTo._id': employee._id }] } });
      }

      const gridMatch = buildGridFilterMatch(filters, PROJECT_GRID_FIELDS);
      if (gridMatch) pipeline.push({ $match: gridMatch });

      const totalResult = await projectModel.aggregate([...pipeline, { $count: "total" }]);
      const total = totalResult.length > 0 ? totalResult[0].total : 0;

      pipeline.push({ $sort: buildGridSort(sortKey, sortDir, PROJECT_GRID_FIELDS, { updatedAt: -1 }) });
      pipeline.push({ $skip: (page - 1) * row });
      pipeline.push({ $limit: row });

      const projects = await projectModel.aggregate(pipeline);

      return res.status(200).json({
         success: true,
         message: projects.length > 0 ? "Projects fetched successfully" : "No projects found",
         data: projects,
         total
      });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to get projects",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

const ASSIGNMENT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Lost', 'Rejected'] as const;

/**
 * One status update for an assigned project: Pending, In Progress, Completed, Lost or Rejected.
 * Lost and Rejected need a note, the others take an optional one. In Progress creates the
 * Project record the first time. Allowed for the assigned engineer or a user who can assign.
 */
export const updateAssignmentStatus = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const { id } = req.params;
      const { status } = req.body;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (!mongoose.isValidObjectId(id)) {
         return res.status(400).json({ success: false, message: "Invalid project ID" });
      }
      if (!(ASSIGNMENT_STATUSES as readonly string[]).includes(status)) {
         return res.status(400).json({ success: false, message: "Invalid status" });
      }
      if ((status === 'Lost' || status === 'Rejected') && !note) {
         return res.status(400).json({ success: false, message: `A note is required to mark a project as ${status.toLowerCase()}` });
      }

      const assignment = await technicalModel.findById(id);
      if (!assignment) {
         return res.status(404).json({ success: false, message: "Project not found" });
      }
      const isEngineer = assignment.assignedTo?.toString() === employee._id.toString();
      const canManage = employee.category?.privileges?.technical?.canViewOpenToWorkAndAssign === true;
      if (!isEngineer && !canManage) {
         return res.status(403).json({ success: false, message: "Only the assigned engineer can update this project" });
      }

      const now = new Date();
      let project: any = await projectModel.findOne({ technical: assignment._id });
      const previousStatus: string = project?.status || assignment.status;

      if (status === 'Completed' || status === 'Lost') {
         if (!project) {
            return res.status(409).json({ success: false, message: "Start the project before completing or losing it" });
         }
      }

      if (status === 'In Progress' && !project) {
         const job = assignment.jobId ? await jobModel.findById(assignment.jobId).select('allocateType') : null;
         for (let attempt = 0; attempt < 3 && !project; attempt++) {
            try {
               project = await projectModel.create({
                  projectNumber: await nextProjectNumber(),
                  technical: assignment._id,
                  jobId: assignment.jobId,
                  customer: assignment.customer,
                  projectType: assignment.projectType,
                  allocateType: (job as any)?.allocateType || '',
                  priority: assignment.priority,
                  assignedTo: assignment.assignedTo,
                  assignedBy: assignment.assignedBy,
                  assignedAt: assignment.assignedAt,
                  status: 'In Progress',
                  startedAt: now,
                  startedBy: employee._id,
                  estimatedCostForProject: assignment.estimatedCostForProject || 0,
                  statusHistory: [{ status: 'In Progress', remarks: note, changedBy: employee._id, changedAt: now }],
               });
            } catch (error: any) {
               if (error?.code !== 11000 || attempt === 2) throw error;
            }
         }
      } else if (project) {
         project.status = status;
         project.closureRemarks = ['Completed', 'Lost', 'Rejected'].includes(status) ? note : '';
         if (status === 'Completed') project.completedAt = now;
         if (status === 'Lost') project.lostAt = now;
         project.statusHistory.push({ status, remarks: note, changedBy: employee._id, changedAt: now });
         await project.save();
      }

      // The assignment follows: Pending/Rejected stay visible in their tabs, everything else is Approved.
      const assignmentStatus = status === 'Pending' ? 'Pending' : status === 'Rejected' ? 'Rejected' : 'Approved';
      const update: any = { status: assignmentStatus, respondedAt: now, respondedBy: employee._id, updatedAt: now };
      if (status === 'Rejected') update.rejectReason = note;
      await technicalModel.updateOne({ _id: assignment._id }, update);

      await logAudit(req, {
         entityType: 'project', entityId: assignment._id, entityLabel: project?.projectNumber,
         action: 'status-changed', summary: `Project ${project?.projectNumber || ''} marked as ${status}${note ? `: ${note}` : ''}`.replace('  ', ' '),
         changes: [{ label: 'Status', from: previousStatus, to: status }],
      });
      return res.status(200).json({ success: true, message: `Project marked as ${status}`, data: project || assignment });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to update project status",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};

/** Moves a started project from In Progress to Completed or Lost. */
export const updateWorkProjectStatus = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const employee = await getEmployeeData(req.user);
      if (!employee) {
         return res.status(401).json({ success: false, message: "Employee not found" });
      }

      const { id } = req.params;
      const { status, remarks } = req.body;
      if (!mongoose.isValidObjectId(id)) {
         return res.status(400).json({ success: false, message: "Invalid project ID" });
      }
      if (!['Completed', 'Lost'].includes(status)) {
         return res.status(400).json({ success: false, message: "Status must be Completed or Lost" });
      }
      const note = typeof remarks === 'string' ? remarks.trim() : '';
      if (status === 'Lost' && !note) {
         return res.status(400).json({ success: false, message: "Remarks are required when marking a project as lost" });
      }

      const existing = await projectModel.findById(id).select('assignedTo status');
      if (!existing) {
         return res.status(404).json({ success: false, message: "Project not found" });
      }
      const isEngineer = existing.assignedTo.toString() === employee._id.toString();
      const canManage = employee.category?.privileges?.technical?.canViewOpenToWorkAndAssign === true;
      if (!isEngineer && !canManage) {
         return res.status(403).json({ success: false, message: "Only the assigned engineer can update this project" });
      }

      const now = new Date();
      const project = await projectModel.findOneAndUpdate(
         { _id: id, status: 'In Progress' },
         {
            status,
            closureRemarks: note,
            ...(status === 'Completed' ? { completedAt: now } : { lostAt: now }),
            $push: { statusHistory: { status, remarks: note, changedBy: employee._id, changedAt: now } },
         },
         { new: true }
      );
      if (!project) {
         return res.status(409).json({ success: false, message: "Only projects in progress can be updated" });
      }

      await logAudit(req, {
         entityType: 'project', entityId: project.technical, entityLabel: project.projectNumber,
         action: 'status-changed', summary: `Project ${project.projectNumber} marked as ${status}${note ? `: ${note}` : ''}`,
         changes: [{ label: 'Status', from: 'In Progress', to: status }],
      });
      return res.status(200).json({ success: true, message: `Project marked as ${status}`, data: project });
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: "Failed to update project status",
         error: error instanceof Error ? error.message : "Unknown error"
      });
   }
};
