import { Request, Response } from "express";
import PurchaseOrder from "../models/purchaseOrder.model"; 
import purchaseRequest from "../models/purchaseRequest.model"
import mongoose from "mongoose";
import { getEmployeeData } from "../common/utils/util";

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const {
      poNo,
      items,
      supplierId,
      purchaseId,
      jobId,
      quoteId,
      etaTerms,
      paymentTerms,
      shippingTerms,
      deliveryTerms,
      placeOfDelivery,
      subject,
      poDate,
      termsAndCondition,
      discount,
    } = req.body;
    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);

    // Validate required fields
    if (!poNo || !supplierId || !purchaseId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: poNo, supplierId, purchaseId, and items are required",
      });
    }

    // Validate items structure
    for (const item of items) {
      if (!item.detail || typeof item.quantity !== 'number' || typeof item.unitCost !== 'number') {
        return res.status(400).json({
          success: false,
          message: "Invalid item structure. Each item must have detail, quantity, and unitCost",
        });
      }
    }

    // Check if purchase request exists
    const existingPurchaseRequest = await purchaseRequest.findById(purchaseId);
    if (!existingPurchaseRequest) {
      return res.status(404).json({
        success: false,
        message: "Purchase request not found",
      });
    }

    // Check if PO already exists for this purchase request
    const existingPO = await PurchaseOrder.findOne({ purchaseId });
    if (existingPO) {
      return res.status(409).json({
        success: false,
        message: "Purchase order already exists for this purchase request",
      });
    }

    // Create purchase order data with validated fields
    const purchaseOrderData = {
      poNo,
      items,
      supplierId,
      purchaseId,
      jobId,
      quoteId,
      etaTerms: etaTerms || '',
      paymentTerms: paymentTerms || '',
      shippingTerms: shippingTerms || '',
      deliveryTerms: deliveryTerms || '',
      placeOfDelivery: placeOfDelivery || '',
      subject: subject || '',
      poDate: poDate ? new Date(poDate) : new Date(),
      termsAndCondition: termsAndCondition || '',
      discount: discount || 0,
      createdBy: employee._id,
    };

    const purchaseOrder = new PurchaseOrder(purchaseOrderData);
    await purchaseOrder.save();


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
    const { page = 1, row = 10, search = "", status, purchaseId } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(row);
    const skip = (pageNumber - 1) * pageSize;


    const initialMatchStage: any = {};
    const finalMatchStage: any = {};

    if (purchaseId) {
      initialMatchStage.purchaseId = new mongoose.Types.ObjectId(purchaseId as string);
    }

    if (search) {
      finalMatchStage.$or = [
        { "poNo": { $regex: search, $options: "i" } },
        { "supplierId.supplierName": { $regex: search, $options: "i" } },
        { "subject": { $regex: search, $options: "i" } }
      ];
    }

    if (status && Array.isArray(status)) {
      finalMatchStage.poStatus = { $in: status };
    } else if (status) {
      finalMatchStage.poStatus = status;
    }

    const pipeline: any[] = [
      ...(Object.keys(initialMatchStage).length > 0 ? [{ $match: initialMatchStage }] : []),
      {
        $lookup: {
          from: "suppliers",
          localField: "supplierId",
          foreignField: "_id",
          as: "supplierId"
        }
      },
      { $unwind: { path: "$supplierId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "purchases", // Purchase Request collection
          localField: "purchaseId",
          foreignField: "_id",
          as: "purchaseId"
        }
      },
      { $unwind: { path: "$purchaseId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "jobId"
        }
      },
      { $unwind: { path: "$jobId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "quotations",
          localField: "jobId.quoteId",
          foreignField: "_id",
          as: "quoteId"
        }
      },
      { $unwind: { path: "$quoteId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "employees",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy"
        }
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalLpoValue: {
            $sum: "$items.totalCost"
          }
        }
      },
      // Apply final filters after lookup and population
      ...(Object.keys(finalMatchStage).length > 0 ? [{ $match: finalMatchStage }] : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: pageSize }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const result = await PurchaseOrder.aggregate(pipeline);
    const purchaseOrders = result[0].data;
    const totalItems = result[0].totalCount[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: purchaseOrders,
      pagination: {
        total: totalItems,
        page: pageNumber,
        pageSize: pageSize,
        totalPages: Math.ceil(totalItems / pageSize)
      }
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

export const generateLpoNo = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); 
    let nextNumber = 1;
  
    // Find the last order by sorting by poNo to ensure proper sequence
    const lastOrder = await PurchaseOrder.findOne(
      { poNo: { $regex: `^NTP-LP-\\d{4}-${year}$` } }
    ).sort({ poNo: -1 });
  
    if (lastOrder && lastOrder.poNo) {
      const parts = lastOrder.poNo.split("-");
      if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
        const lastSeq = parseInt(parts[2]); 
        nextNumber = lastSeq + 1;
      }
    }
  
    const poNo = `NTP-LP-${nextNumber.toString().padStart(4, "0")}-${year}`;
    
    // Verify this PO number doesn't already exist
    const existingPO = await PurchaseOrder.findOne({ poNo });
    if (existingPO) {
      return res.status(409).json({
        success: false,
        message: "Generated PO number already exists. Please try again.",
      });
    }
    
    return res.status(200).json({
      success: true,
      message: "Purchase order number generated successfully",
      data: poNo,
    });
  } catch (error: any) {
    console.error("Generate PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate purchase order number",
      error: error.message,
    });
  }
};

export const updatePurchaseOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { poStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    // Validate status
    const validStatuses = ["Open", "Hold", "Closed", "Cancelled"];
    if (!poStatus || !validStatuses.includes(poStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      { 
        $set: { 
          poStatus: poStatus,
          updatedAt: new Date()
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPurchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase order status updated successfully",
      data: updatedPurchaseOrder,
    });
  } catch (error: any) {
    console.error("Update purchase order status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update purchase order status",
      error: error.message,
    });
  }
};

export const updateSupplierInvoices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { supplierInvoices } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    if (!supplierInvoices || !Array.isArray(supplierInvoices)) {
      return res.status(400).json({
        success: false,
        message: "supplierInvoices must be an array",
      });
    }

    // Validate supplier invoices structure
    for (const invoice of supplierInvoices) {
      if (!invoice.fileName || !invoice.originalname) {
        return res.status(400).json({
          success: false,
          message: "Each supplier invoice must have fileName and originalname",
        });
      }
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      { 
        $set: { 
          supplierInvoices: supplierInvoices,
          updatedAt: new Date()
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPurchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Supplier invoices updated successfully",
      data: updatedPurchaseOrder,
    });
  } catch (error: any) {
    console.error("Update supplier invoices error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update supplier invoices",
      error: error.message,
    });
  }
};