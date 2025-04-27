import { Request, Response } from 'express';
import Supplier from '../models/supplier.model';
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
      const files = (req as any).files || []
      
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
         address,
         supplierType,
         category,
         contactDetails,
         documents: documents, // ← correct variable here
         products,
         creditDays,
         creditValue,
         createdBy: new Types.ObjectId(createdBy),
         createdDate: new Date(),
         updatedDate: new Date(),
         status: 'Pending', // Default status
      });

      // Save the supplier to database
      const savedSupplier = await newSupplier.save();

      return res.status(201).json({
         success: true,
         message: 'Supplier created successfully',
         data: savedSupplier,
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
