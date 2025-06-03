import { NextFunction, Request, Response } from 'express';
import Supplier, { supplierStatus } from '../models/supplier.model';
import { Types } from 'mongoose';
import { deleteFileFromAws, uploadFileToAws } from '../common/aws-connect';
import { PipelineStage } from 'mongoose';


export const getSuppliers = async (req: Request, res: Response) => {
   try {
      let { page = 1, row = 10, toDate, fromDate, status, category, supplierType } = req.body;

      // Convert string page and row to numbers
      page = parseInt(page.toString());
      row = parseInt(row.toString());

      // Calculate skip value for pagination
      const skip = (page - 1) * row;

      // Build filter object
      const filter: Record<string, any> = { isDeleted: false };

      // Add date range filter if provided
      if (fromDate || toDate) {
         filter.createdDate = {};
         if (fromDate) {
            filter.createdDate.$gte = new Date(fromDate);
         }
         if (toDate) {
            // Set time to end of day for toDate
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);
            filter.createdDate.$lte = endDate;
         }
      }

      // Add status filter if provided
      if (status) {
         // Handle both single status and array of statuses
         filter.status = Array.isArray(status) ? { $in: status } : status;
      }

      // Add category filter if provided (now it's an ObjectId)
      if (category) {
         filter.category = category; // Assuming category is already an ObjectId string
      }

      // Add supplierType filter if provided
      if (supplierType) {
         filter.supplierType = supplierType;
      }

      // Use aggregation pipeline for advanced querying with lookups
      const aggregationPipeline: PipelineStage[] = [
         { $match: filter },
         // Lookup for category (which is now a reference)
         {
            $lookup: {
               from: 'employees', // Based on your schema, category references 'Employee'
               localField: 'category',
               foreignField: '_id',
               as: 'categoryDetails'
            }
         },
         {
            $lookup: {
               from: 'departments', // createdBy now references 'Department'
               localField: 'createdBy',
               foreignField: '_id',
               as: 'createdByDepartment'
            }
         },
         {
            $lookup: {
               from: 'employees',
               localField: 'approvedData.approvedBy',
               foreignField: '_id',
               as: 'approvedByEmployee'
            }
         },
         {
            $addFields: {
               categoryInfo: { $arrayElemAt: ["$categoryDetails", 0] },
               createdByInfo: { $arrayElemAt: ["$createdByDepartment", 0] },
               approvedByInfo: { $arrayElemAt: ["$approvedByEmployee", 0] }
            }
         },
         {
            $project: {
               supplierId: 1,
               supplierName: 1,
               address: 1,
               supplierType: 1,
               category: "$categoryInfo", // Use the looked-up category info
               contactDetails: 1,
               documents: 1,
               status: 1,
               products: 1,
               creditDays: 1,
               creditValue: 1,
               createdDate: 1,
               updatedDate: 1,
               createdBy: "$createdByInfo", // Use the looked-up department info
               approvedData: 1,
               rejectHistory: 1
            }
         },
         { $sort: { createdDate: -1 } }, // Sort by createdDate in descending order
         { $skip: skip },
         { $limit: row }
      ];

      // Count total documents for pagination
      const totalDocs = await Supplier.countDocuments(filter);

      // Execute aggregation pipeline with proper typing
      const suppliersData = await Supplier.aggregate(aggregationPipeline).exec();

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalDocs / row);

      return res.status(200).json({
         success: true,
         message: 'Suppliers fetched successfully',
         data: {
            suppliers: suppliersData,
            pagination: {
               total: totalDocs,
               page,
               pages: totalPages,
               limit: row
            }
         }
      });
   } catch (error) {
      console.error('Error fetching suppliers:', error);
      return res.status(500).json({
         success: false,
         message: 'Error fetching suppliers',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
}

export const createSupplier = async (req: Request, res: Response) => {
   try {
      const {
         supplierName,
         address,
         supplierType,
         category,
         contactDetails,
         products,
         creditDays,
         creditValue,
         createdBy,
      } = JSON.parse(req.body.supplier);

      // Validate required fields
      if (!supplierName || !supplierType || !category || !contactDetails || !products) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }

      // Handle file uploads
      const files = (req as any).files.documents || []
      console.log(files);

      let documents: { fileName: string; originalname: string }[] = [];
      if (files && Array.isArray(files)) {
         documents = await Promise.all(
            files.map(async (file: any) => {
               await uploadFileToAws(file.filename, file.path);
               return {
                  fileName: file.filename,
                  originalname: file.originalname,
               };
            })
         );
      }


      // Create new supplier object
      const newSupplier = new Supplier({
         supplierName,
         address: address,
         supplierType,
         category,
         contactDetails: contactDetails,
         documents: documents,
         products: products,
         creditDays,
         creditValue,
         createdBy: new Types.ObjectId(createdBy),
         createdDate: new Date(),
         updatedDate: new Date(),
         status: 'Pending', // Default status
      });

      // Save the supplier to database
      const savedSupplier = await newSupplier.save();

      // Populate the createdBy field before returning
      const populatedSupplier = await Supplier.findById(savedSupplier._id)
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         });

      return res.status(201).json({
         success: true,
         message: 'Supplier created successfully',
         data: populatedSupplier,
      });
   } catch (error) {
      console.error('Error creating supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error creating supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

export const updateSupplierStatus = async (req: any, res: Response) => {
   try {
      const { id: supplierId } = req.params;
      const { status, comment } = req.body;
      const { id: userId } = req.auth.credentials;

      // Validate required fields
      if (!supplierId || !status) {
         return res.status(400).json({
            success: false,
            message: 'id (params) and status are required',
         });
      }

      // Validate status
      const validStatuses = Object.values(supplierStatus);
      const statusToUpdate = Array.isArray(status) ? status[0] : status;

      if (!validStatuses.includes(statusToUpdate)) {
         return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
         });
      }

      // Find the supplier
      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      // Handle different status updates
      if (statusToUpdate === supplierStatus.approved) {
         // Approval logic
         if (!userId) {
            return res.status(400).json({
               success: false,
               message: 'approvedBy is required for approval',
            });
         }

         if (supplier.status === supplierStatus.approved) {
            return res.status(400).json({
               success: false,
               message: 'Supplier is already approved',
            });
         }

         const { location } = supplier.address;
         const newSupplierId = await generateSupplierId(location);

         supplier.supplierId = newSupplierId;
         supplier.status = supplierStatus.approved;
         supplier.approvedData = {
            date: new Date(),
            reason: comment,
            approvedBy: new Types.ObjectId(userId)
         };
         supplier.updatedDate = new Date();

      } else if (statusToUpdate === supplierStatus.rejected) {
         // Rejection logic
         if (!userId) {
            return res.status(400).json({
               success: false,
               message: 'rejectedBy is required for rejection',
            });
         }

         // Add rejection to history
         supplier.rejectHistory.push({
            date: new Date(),
            reason: comment,
            rejectedBy: new Types.ObjectId(userId)
         });

         supplier.status = supplierStatus.rejected;
         supplier.updatedDate = new Date();

      } else if (statusToUpdate === supplierStatus.pending) {
         // Handle pending status
         supplier.status = supplierStatus.pending;
         supplier.updatedDate = new Date();
      }

      // Save the updated supplier
      const updatedSupplier = await supplier.save();

      // Populate both createdBy, approvedBy, and rejection history fields before returning
      const populatedSupplier = await Supplier.findById(updatedSupplier._id)
         .populate({
            path: 'createdBy',
            select: 'departmentName',
         })
         .populate({
            path: 'approvedData.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'rejectHistory.rejectedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'category',
            select: 'firstName lastName',
         });

      // Determine success message based on status
      const successMessage = statusToUpdate === supplierStatus.approved
         ? 'Supplier approved successfully'
         : statusToUpdate === supplierStatus.rejected
            ? 'Supplier rejected successfully'
            : 'Supplier status updated successfully';

      return res.status(200).json({
         success: true,
         message: successMessage,
         data: populatedSupplier,
      });
   } catch (error) {
      console.error('Error updating supplier status:', error);
      return res.status(500).json({
         success: false,
         message: 'Error updating supplier status',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

export const deleteSupplier = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;

      // Validate id
      if (!id) {
         return res.status(400).json({
            success: false,
            message: 'Supplier ID is required'
         });
      }

      // Find and update the supplier to set isDeleted to true
      const updatedSupplier = await Supplier.findByIdAndUpdate(
         id,
         { isDeleted: true },
         { new: true }
      )
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedData.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })

      if (!updatedSupplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found'
         });
      }

      return res.status(200).json({
         success: true,
         message: 'Supplier marked as deleted successfully',
         data: updatedSupplier
      });

   } catch (error) {
      console.error('Error deleting supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Internal server error',
         error: error.message
      });
   }
};



export const updateSupplier = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;
      const {
         supplierName,
         address,
         supplierType,
         category,
         contactDetails,
         products,
         creditDays,
         creditValue,
         updatedBy,
      } = JSON.parse(req.body.supplier);

      // Validate required fields
      console.log(req.body);
      if (!id || !supplierName || !supplierType || !category || !contactDetails || !products) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }

      // Find the existing supplier to get current documents and status
      const existingSupplier = await Supplier.findById(id);
      if (!existingSupplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      // Determine the new status: if existing is 'rejected', change to 'pending'
      let newStatus = existingSupplier.status;
      if (existingSupplier.status === supplierStatus.rejected) {
         newStatus = supplierStatus.pending;
      }

      const files = (req as any).files?.documents || [];

      let documents: { fileName: string; originalname: string }[] = [];
      if (files && files.length > 0) {
         // Delete old documents from AWS if new documents are being uploaded
         if (existingSupplier.documents && existingSupplier.documents.length > 0) {
            for (const doc of existingSupplier.documents) {
               await deleteFileFromAws(doc.fileName);
               console.log(`Deleted old document: ${doc.fileName}`);
            }
         }

         // Upload new documents
         documents = await Promise.all(
            files.map(async (file: any) => {
               await uploadFileToAws(file.filename, file.path);
               return {
                  fileName: file.filename,
                  originalname: file.originalname,
               };
            })
         );
      } else {
         // Keep existing documents if no new ones are provided
         documents = existingSupplier.documents || [];
         console.log("No new files found, keeping existing documents");
      }

      // Find the supplier by ID and update it
      const updatedSupplier = await Supplier.findByIdAndUpdate(
         id,
         {
            supplierName,
            address: address,
            supplierType,
            category,
            contactDetails: contactDetails,
            documents, // Always update documents (either new ones or existing ones)
            products: products,
            creditDays,
            creditValue,
            updatedBy: new Types.ObjectId(updatedBy),
            updatedDate: new Date(),
            status: newStatus, // Update status accordingly
         },
         { new: true }
      )
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedData.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         });

      return res.status(200).json({
         success: true,
         message: 'Supplier updated successfully',
         data: updatedSupplier,
      });
   } catch (error) {
      console.error('Error updating supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error updating supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};



export const getSupplierById = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;

      if (!id) {
         return res.status(400).json({
            success: false,
            message: 'Supplier ID is required',
         });
      }

      // Find supplier by ID and populate createdBy, approvedBy, and updatedBy references
      const supplier = await Supplier.findById(id)
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedData.approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'category',
            select: 'departmentName _id',
         });

      if (!supplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      return res.status(200).json({
         success: true,
         data: supplier,
      });
   } catch (error) {
      console.error('Error fetching supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error fetching supplier',
         error: error instanceof Error ? error.message : 'Unknown error',
      });
   }
};

const generateSupplierId = async (countryName: string, code: string = 'YYMM') => {
   const locationCode = countryName.trim().substring(0, 3).toUpperCase();

   // Find the supplier with the highest sequence number globally
   const latestSupplier = await Supplier.findOne({
      supplierId: { $regex: `^SUP_[A-Z]{3}_${code}_\\d{3}$` }
   }).sort({ supplierId: -1 });

   let sequence = 1;
   if (latestSupplier) {
      // Extract the sequence number from the latest supplier ID
      const lastSequence = parseInt(latestSupplier.supplierId.slice(-3), 10);
      if (!isNaN(lastSequence)) {
         sequence = lastSequence + 1;
      }
   }

   const sequenceStr = sequence.toString().padStart(3, '0');
   return `SUP_${locationCode}_${code}_${sequenceStr}`;
};

export const getSupplierList = async (req: Request, res: Response, next: NextFunction) => {
   try {
      const suppliers = await Supplier.find(
         {
            isDeleted: false,
            status: 'Approved'
         },
         {
            _id: 1,
            supplierName: 1
         }
      );

      return res.status(200).json({
         success: true,
         data: suppliers
      })
   } catch (error) {
      console.log(error)
      next(error)
   }
}