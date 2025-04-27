import { Request, Response } from 'express';
import Supplier, { supplierStatus } from '../models/supplier.model';
import { Types } from 'mongoose';
import { uploadFileToAws } from '../common/aws-connect';

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
      } = req.body;

      // Validate required fields
      if (!supplierName || !supplierType || !category || !contactDetails || !products) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }

      // Handle file uploads
      const files = (req as any).documents || []

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
         address: JSON.parse(address),
         supplierType,
         category,
         contactDetails: JSON.parse(contactDetails),
         documents: documents,
         products: JSON.parse(products),
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

export const updateSupplierStatus = async (req: Request, res: Response) => {
   try {
      const { id } = req.params;
      const { approvedBy } = req.body;

      if (!id || !approvedBy) {
         return res.status(400).json({
            success: false,
            message: 'id (params) and approvedBy are required',
         });
      }

      const supplier = await Supplier.findById(id);

      if (!supplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

      if (supplier.status === 'Approved') {
         return res.status(400).json({
            success: false,
            message: 'Supplier is already approved',
         });
      }

      const { country } = supplier.address;

      const newSupplierId = await generateSupplierId(country);

      supplier.supplierId = newSupplierId;
      supplier.status = supplierStatus.approved;
      supplier.approvedDate = new Date();
      supplier.approvedBy = new Types.ObjectId(approvedBy);
      supplier.updatedDate = new Date();

      const updatedSupplier = await supplier.save();

      // Populate both createdBy and approvedBy fields before returning
      const populatedSupplier = await Supplier.findById(updatedSupplier._id)
         .populate({
            path: 'createdBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })
         .populate({
            path: 'approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         });

      return res.status(200).json({
         success: true,
         message: 'Supplier approved successfully',
         data: populatedSupplier,
      });
   } catch (error) {
      console.error('Error approving supplier:', error);
      return res.status(500).json({
         success: false,
         message: 'Error approving supplier',
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
            path: 'approvedBy',
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
      } = req.body;

      // Validate required fields
      if (!id || !supplierName || !supplierType || !category || !contactDetails || !products) {
         return res.status(400).json({
            success: false,
            message: 'Please provide all required fields',
         });
      }

      // Handle file uploads
      const files = (req as any).documents || [];

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

      // Find the supplier by ID and update it
      const updatedSupplier = await Supplier.findByIdAndUpdate(
         id,
         {
            supplierName,
            address: JSON.parse(address),
            supplierType,
            category,
            contactDetails: JSON.parse(contactDetails),
            documents: documents.length > 0 ? documents : undefined, // Only update if new documents provided
            products: JSON.parse(products),
            creditDays,
            creditValue,
            updatedBy: new Types.ObjectId(updatedBy),
            updatedDate: new Date(),
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
            path: 'approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })

      if (!updatedSupplier) {
         return res.status(404).json({
            success: false,
            message: 'Supplier not found',
         });
      }

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
}

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
            path: 'approvedBy',
            select: 'firstName lastName designation department',
            populate: {
               path: 'department',
               select: 'departmentName',
            },
         })

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