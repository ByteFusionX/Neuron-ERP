import { Request, Response } from "express";
import GRN from "../models/grn.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import mongoose from "mongoose";
import { getEmployeeData } from "../common/utils/util";

export const generateGRNNumber = async (req: Request, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `GRN-${currentYear}`;

    const lastEntry = await GRN.findOne({
      grnNo: new RegExp(`^${prefix}`)
    }).sort({ createdAt: -1 });

    let sequence = 1;
    if (lastEntry && lastEntry.grnNo) {
      const parts = lastEntry.grnNo.split('-');
      if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
        const lastSequence = parseInt(parts[2]);
        sequence = lastSequence + 1;
      }
    }

    const grn = `${prefix}-${sequence.toString().padStart(4, '0')}`;

    return res.status(200).json({ grn });
  } catch (error: any) {
    console.error("Generate GRN Number error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate GRN number",
      error: error.message,
    });
  }
};

export const createGRN = async (req: Request, res: Response) => {
  try {
    const {
      grnNo,
      grnDate,
      purchaseOrderId,
      supplierInvoiceNo,
      supplierInvoiceDate,
      supplierDeliveryNoteNo,
      receivedBy,
      warehouse,
      items
    } = req.body;

    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);

    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(purchaseOrderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID"
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(purchaseOrderId);
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found"
      });
    }

    if (!grnNo || !grnDate || !warehouse || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: grnNo, grnDate, warehouse, and items are required"
      });
    }

    for (const item of items) {
      if (!item.itemDescription || typeof parseInt(item.orderedQty) !== 'number' || 
          typeof parseInt(item.receivedQty) !== 'number' || typeof parseInt(item.acceptedQty) !== 'number') {
        return res.status(400).json({
          success: false,
          message: "Invalid item structure. Each item must have itemDescription, orderedQty, receivedQty, and acceptedQty"
        });
      }
    }

    const existingGRN = await GRN.findOne({ 
      purchaseOrderId,
      isDeleted: { $ne: true }
    });

    const grnData: any = {
      grnNo,
      grnDate: new Date(grnDate),
      purchaseOrderId,
      warehouse,
      items,
      createdBy: employee._id
    };

    if (supplierInvoiceNo) {
      grnData.supplierInvoiceNo = supplierInvoiceNo;
    }
    if (supplierInvoiceDate) {
      grnData.supplierInvoiceDate = new Date(supplierInvoiceDate);
    }
    if (supplierDeliveryNoteNo) {
      grnData.supplierDeliveryNoteNo = supplierDeliveryNoteNo;
    }
    if (receivedBy) {
      grnData.receivedBy = receivedBy;
    }

    let grn;
    if (existingGRN) {
      grn = await GRN.findByIdAndUpdate(
        existingGRN._id,
        grnData,
        { new: true, runValidators: true }
      ).populate('warehouse')
       .populate('receivedBy')
       .populate({
         path: 'purchaseOrderId',
         populate: [
           { path: 'supplierId' },
           { 
             path: 'purchaseId', 
             populate: [
               { path: 'jobId', populate: { path: 'quoteId', populate: { path: 'client' } } },
               { path: 'customerId' }
             ]
           },
           { path: 'quoteId', populate: { path: 'client' } }
         ]
       })
       .populate('createdBy');
    } else {
      grn = new GRN(grnData);
      await grn.save();
      grn = await GRN.findById(grn._id)
        .populate('warehouse')
        .populate('receivedBy')
        .populate({
          path: 'purchaseOrderId',
          populate: [
            { path: 'supplierId' },
            { 
              path: 'purchaseId', 
              populate: [
                { path: 'jobId', populate: { path: 'quoteId', populate: { path: 'client' } } },
                { path: 'customerId' }
              ]
            },
            { path: 'quoteId', populate: { path: 'client' } }
          ]
        })
        .populate('createdBy');
    }

    return res.status(200).json({
      success: true,
      message: existingGRN ? "GRN updated successfully" : "GRN created successfully",
      data: grn
    });
  } catch (error: any) {
    console.error("Create GRN error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create/update GRN",
      error: error.message,
    });
  }
};

export const getGRNByLpoId = async (req: Request, res: Response) => {
  try {
    const { lpoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(lpoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID"
      });
    }

    const grn = await GRN.findOne({ 
      purchaseOrderId: lpoId,
      isDeleted: { $ne: true }
    })
      .populate('warehouse')
      .populate('receivedBy')
      .populate({
        path: 'purchaseOrderId',
        populate: [
          { path: 'supplierId' },
          { 
            path: 'purchaseId', 
            populate: [
              { path: 'jobId', populate: { path: 'quoteId', populate: { path: 'client' } } },
              { path: 'customerId' }
            ]
          },
          { path: 'quoteId', populate: { path: 'client' } }
        ]
      })
      .populate('createdBy');

    if (!grn) {
      return res.status(404).json({
        success: false,
        message: "GRN not found for this purchase order"
      });
    }

    return res.status(200).json({
      success: true,
      data: grn
    });
  } catch (error: any) {
    console.error("Get GRN by LPO ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch GRN",
      error: error.message,
    });
  }
};

export const getGRNById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GRN ID"
      });
    }

    const grn = await GRN.findById(id)
      .populate('warehouse')
      .populate('receivedBy')
      .populate({
        path: 'purchaseOrderId',
        populate: [
          { path: 'supplierId' },
          { 
            path: 'purchaseId', 
            populate: [
              { path: 'jobId', populate: { path: 'quoteId', populate: { path: 'client' } } },
              { path: 'customerId' }
            ]
          },
          { path: 'quoteId', populate: { path: 'client' } }
        ]
      })
      .populate('createdBy');

    if (!grn || grn.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "GRN not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: grn
    });
  } catch (error: any) {
    console.error("Get GRN by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch GRN",
      error: error.message,
    });
  }
};

