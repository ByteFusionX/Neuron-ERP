import { Request, Response } from "express";
import GRN from "../models/grn.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import StockEntry from "../models/stockEntry.model";
import Product from "../models/products.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import mongoose from "mongoose";
import { getEmployeeData } from "../common/utils/util";
import { checkAndUpdateJobCompletionStatus } from "./job.controller";

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
      const orderedQty = Number(item.orderedQty);
      const receivedQty = Number(item.receivedQty);
      const acceptedQty = Number(item.acceptedQty);
      
      if (!item.itemDescription || isNaN(orderedQty) || isNaN(receivedQty) || isNaN(acceptedQty) ||
          orderedQty < 0 || receivedQty < 0 || acceptedQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid item structure. Each item must have itemDescription, and valid numeric values for orderedQty, receivedQty, and acceptedQty"
        });
      }
    }

    const existingGRNs = await GRN.find({ 
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

    const grn = new GRN(grnData);
    await grn.save();
    
    const populatedGrn = await GRN.findById(grn._id)
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

    const warnings: string[] = [];
    const populatedPurchaseOrder = populatedGrn.purchaseOrderId as any;
    const purchaseId = populatedPurchaseOrder?.purchaseId?._id || populatedPurchaseOrder?.purchaseId;
    
    let purchaseRequest: any = null;
    if (purchaseId && mongoose.Types.ObjectId.isValid(purchaseId)) {
      purchaseRequest = await PurchaseRequest.findById(purchaseId);
    }

    for (let i = 0; i < items.length; i++) {
      const grnItem = items[i];
      const acceptedQty = Number(grnItem.acceptedQty);
      
      if (acceptedQty <= 0) {
        continue;
      }

      let product: any = null;
      if (grnItem.partNo) {
        const partNoStr = typeof grnItem.partNo === 'string' 
          ? grnItem.partNo 
          : (grnItem.partNo?.partNo || grnItem.partNo?._id || '');
        
        if (partNoStr && partNoStr !== '-') {
          product = await Product.findOne({ 
            partNo: new RegExp(`^${partNoStr}$`, 'i'),
            isDeleted: { $ne: true }
          });
        }
      }

      if (!product) {
        warnings.push(`Item "${grnItem.itemDescription}" (index ${i + 1}) skipped: Product not found for part number "${grnItem.partNo || 'N/A'}"`);
        continue;
      }

      let matchingLpoItem: any = null;
      if (populatedPurchaseOrder?.items && Array.isArray(populatedPurchaseOrder.items)) {
        matchingLpoItem = purchaseOrder.items.find((lpoItem: any) => {
          let partNoMatch = false;
          if (lpoItem.partNo && product._id) {
            if (typeof lpoItem.partNo === 'object' && lpoItem.partNo._id) {
              partNoMatch = lpoItem.partNo._id.toString() === product._id.toString();
            } else {
              partNoMatch = lpoItem.partNo.toString() === product._id.toString();
            }
          }
          const descriptionMatch = lpoItem.detail && grnItem.itemDescription && 
            lpoItem.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase();
          return partNoMatch || descriptionMatch;
        });
      }

      if (!matchingLpoItem) {
        warnings.push(`Item "${grnItem.itemDescription}" (index ${i + 1}) skipped: No matching PurchaseOrder item found`);
        continue;
      }

      const unitCost = Number(matchingLpoItem.unitCost) || 0;
      const totalCost = unitCost * acceptedQty;
      
      let sellingPrice: number | undefined = undefined;
      if (purchaseRequest?.items && Array.isArray(purchaseRequest.items)) {
        for (const prItem of purchaseRequest.items) {
          if (prItem.itemDetails && Array.isArray(prItem.itemDetails)) {
            const matchingDetail = prItem.itemDetails.find((detail: any) => {
              const partNoMatch = detail.partNo && product._id && 
                detail.partNo.toString() === product._id.toString();
              const descriptionMatch = detail.detail && grnItem.itemDescription && 
                detail.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase();
              return partNoMatch || descriptionMatch;
            });
            
            if (matchingDetail && matchingDetail.unitSellingPrice) {
              sellingPrice = Number(matchingDetail.unitSellingPrice);
              break;
            }
          }
        }
      }

      const jobId = populatedPurchaseOrder?.purchaseId?.jobId?._id || populatedPurchaseOrder?.purchaseId?.jobId || 
                    populatedPurchaseOrder?.jobId?._id || populatedPurchaseOrder?.jobId || undefined;

      const stockEntryGrn = `${grnNo}-${i + 1}`;
      
      const existingStockEntry = await StockEntry.findOne({ 
        grn: stockEntryGrn, 
        isDeleted: { $ne: true } 
      });

      if (existingStockEntry) {
        warnings.push(`Item "${grnItem.itemDescription}" (index ${i + 1}) skipped: Stock entry with GRN "${stockEntryGrn}" already exists`);
        continue;
      }

      const stockEntryData: any = {
        grn: stockEntryGrn,
        partNo: product._id,
        dateOfPurchase: supplierInvoiceDate ? new Date(supplierInvoiceDate) : new Date(grnDate),
        supplierName: populatedPurchaseOrder?.supplierId?._id || populatedPurchaseOrder?.supplierId,
        supplierLpoNo: populatedPurchaseOrder?.poNo || undefined,
        productDescription: grnItem.itemDescription,
        productSegment: product.productSegment,
        productCategory: product.productCategory,
        targetWarehouse: warehouse,
        quantity: acceptedQty,
        unitCost: unitCost,
        totalCost: totalCost,
        createdBy: employee._id,
        createdDate: new Date(),
        updatedDate: new Date(),
        isDeleted: false
      };

      if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
        stockEntryData.jobId = jobId;
      }

      if (grnItem.uom) {
        stockEntryData.uom = grnItem.uom;
      }

      if (sellingPrice !== undefined) {
        stockEntryData.sellingPrice = sellingPrice;
      }

      if (grnItem.remarks) {
        stockEntryData.remarks = grnItem.remarks;
      }

      await StockEntry.create(stockEntryData);
    }

    const allGRNs = await GRN.find({ 
      purchaseOrderId,
      isDeleted: { $ne: true }
    });

    const lpoItems = populatedPurchaseOrder?.items || [];
    let allItemsFullyReceived = true;

    if (lpoItems.length > 0) {
      const productCache = new Map<string, string>();
      
      for (const lpoItem of lpoItems) {
        const orderedQty = Number(lpoItem.quantity) || 0;
        if (orderedQty <= 0) {
          continue;
        }

        let totalAcceptedQty = 0;
        const lpoPartNoId = typeof lpoItem.partNo === 'object' && lpoItem.partNo?._id
          ? lpoItem.partNo._id.toString()
          : (typeof lpoItem.partNo === 'string' && mongoose.Types.ObjectId.isValid(lpoItem.partNo)
              ? lpoItem.partNo
              : null);

        for (const grn of allGRNs) {
          if (grn.items && Array.isArray(grn.items)) {
            for (const grnItem of grn.items) {
              let partNoMatch = false;
              
              if (lpoPartNoId && grnItem.partNo && typeof grnItem.partNo === 'string' && grnItem.partNo !== '-') {
                let productId = productCache.get(grnItem.partNo);
                if (!productId) {
                  const product = await Product.findOne({
                    partNo: new RegExp(`^${grnItem.partNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                    isDeleted: { $ne: true }
                  });
                  if (product) {
                    productId = product._id.toString();
                    productCache.set(grnItem.partNo, productId);
                  }
                }
                
                if (productId && productId === lpoPartNoId) {
                  partNoMatch = true;
                }
              }
              
              const descriptionMatch = lpoItem.detail && grnItem.itemDescription && 
                lpoItem.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase();
              
              if (partNoMatch || descriptionMatch) {
                totalAcceptedQty += Number(grnItem.acceptedQty) || 0;
              }
            }
          }
        }

        if (totalAcceptedQty < orderedQty) {
          allItemsFullyReceived = false;
          break;
        }
      }
    }

    if (allItemsFullyReceived && lpoItems.length > 0) {
      await PurchaseOrder.findByIdAndUpdate(purchaseOrderId, {
        poStatus: 'Closed'
      });

      const jobId = populatedPurchaseOrder?.purchaseId?.jobId?._id || populatedPurchaseOrder?.purchaseId?.jobId || 
                    populatedPurchaseOrder?.jobId?._id || populatedPurchaseOrder?.jobId;
      
      if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
        await checkAndUpdateJobCompletionStatus(jobId.toString());
      }
    }

    const response: any = {
      success: true,
      message: "GRN created successfully",
      data: populatedGrn
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return res.status(200).json(response);
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
      .populate('createdBy')
      .sort({ createdAt: -1 });

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

export const getAllGRNsByLpoId = async (req: Request, res: Response) => {
  try {
    const { lpoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(lpoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID"
      });
    }

    const grns = await GRN.find({ 
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
      .populate('createdBy')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: grns
    });
  } catch (error: any) {
    console.error("Get all GRNs by LPO ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch GRNs",
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

