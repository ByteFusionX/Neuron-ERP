import { Request, Response } from "express";
import PurchaseOrder from "../models/purchaseOrder.model"; 
import purchaseRequest from "../models/purchaseRequest.model"
import mongoose from "mongoose";

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const LpoNo = await generateLpoNo();
    const purchaseOrderData = req.body
    purchaseOrderData.LpoNo = LpoNo;
    const purchaseOrder = new PurchaseOrder(purchaseOrderData);
    await purchaseOrder.save();

    await purchaseRequest.findOneAndUpdate({_id: purchaseOrderData.purchaseId}, {status: 'LPO Issued'})

    return res.status(201).json({
      success: true,
      message: "Purchase order created successfully",
      data: purchaseOrder,
    });
  } catch (error: any) {
    console.error("Create PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create purchase order",
      error: error.message,
    });
  }
};

export const updatePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PurchaseOrder ID",
      });
    }

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase order updated successfully",
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error("Update PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update purchase order",
      error: error.message,
    });
  }
};

export const getPurchaseOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PurchaseOrder ID",
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(id)
      .populate("purchaseId")
      .populate("jobId")
      .populate("dealId");

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: purchaseOrder,
    });
  } catch (error: any) {
    console.error("Get PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purchase order",
      error: error.message,
    });
  }
};

export const getPurchaseOrderByPurchaseId = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PurchaseOrder ID",
      });
    }

    const purchaseOrder = await PurchaseOrder.find({ purchaseId: id })
      .populate("purchaseId")
      .populate("jobId")
      .populate("dealId");

    if (!purchaseOrder  ) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: purchaseOrder,
    });

  } catch (error: any) {
    console.error("Get PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purchase order",
      error: error.message,
    });
  }
};

export const getAllPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const purchaseOrders = await PurchaseOrder.find()
      .populate("purchaseId")
      .populate("jobId")
      .populate("dealId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: purchaseOrders,
    });
  } catch (error: any) {
    console.error("Get All PurchaseOrders error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purchase orders",
      error: error.message,
    });
  }
};

const generateLpoNo = async (): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); 
  let nextNumber = 1;

  const lastOrder = await PurchaseOrder.findOne().sort({ createdAt: -1 });

  if (lastOrder && lastOrder.lpoNo) {
    const parts = lastOrder.lpoNo.split("-");
    const lastSeq = parseInt(parts[2]); 
    const lastYear = parts[3]; 

    if (lastYear === year) {
      nextNumber = lastSeq + 1;
    }
  }

  return `NTP-LP-${nextNumber.toString().padStart(4, "0")}-${year}`;
};