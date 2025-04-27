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
         documents: documents, // ← correct variable here
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



export const updateSupplierStatus = async (req: Request, res: Response) => {
   try {
      const { id } = req.params; // <-- from params
      const { approvedBy } = req.body; // approvedBy from body

      if (!id || !approvedBy) {
         return res.status(400).json({
            success: false,
            message: 'id (params) and  approvedBy are required',
         });
      }

      const supplier = await Supplier.findById({_id: id});

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

      const { country } = supplier.address; // Assuming address is an object with country property


      const newSupplierId = await generateSupplierId(country);

      supplier.supplierId = newSupplierId;
      supplier.status = supplierStatus.approved; // Assuming supplierStatus is an enum or object with status values
      supplier.approvedDate = new Date();
      supplier.approvedBy = new Types.ObjectId(approvedBy);
      supplier.updatedDate = new Date();

      const updatedSupplier = await supplier.save();

      return res.status(200).json({
         success: true,
         message: 'Supplier approved successfully',
         data: updatedSupplier,
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

const generateSupplierId = async (countryName: string) => {
   // Create 3-letter LOC code from location
   const locationCode = countryName.trim().substring(0, 3).toUpperCase(); // ex: 'Qatar' -> 'QAT'

   const prefix = `SUP_${locationCode}_YYMM`;

   // Find the latest supplier with this prefix
   const latestSupplier = await Supplier.findOne({
      supplierId: { $regex: `^${prefix}` }
   }).sort({ createdDate: -1 });

   let sequence = 1;
   if (latestSupplier && latestSupplier.supplierId) {
      const parts = latestSupplier.supplierId.split('_');
      const lastSeq = parseInt(parts[3], 10);
      if (!isNaN(lastSeq)) {
         sequence = lastSeq + 1;
      }
   }

   const sequenceStr = sequence.toString().padStart(3, '0'); // Always 3 digits

   return `${prefix}_${sequenceStr}`;
};
