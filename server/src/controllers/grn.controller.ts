import { Request, Response } from "express";
import GRN from "../models/grn.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import StockEntry from "../models/stockEntry.model";
import Product from "../models/products.model";
import PurchaseRequest from "../models/purchaseRequest.model";
import mongoose from "mongoose";
import { getEmployeeData } from "../common/utils/util";
import { checkAndUpdateJobCompletionStatus } from "./job.controller";
import { uploadFileToAws } from "../common/aws-connect";
import { getNextSequence } from "../models/counter.model";
import { createNotificationWithPrivileges } from "./notification.controller";
import { Server } from "socket.io";
import { SupplierReturn } from "../models/supplierReturn.model";

const seedGRNSequence = (prefix: string) => async (): Promise<number> => {
  const lastEntry = await GRN.findOne({
    grnNo: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  if (lastEntry && lastEntry.grnNo) {
    const parts = lastEntry.grnNo.split('-');
    if (parts.length >= 4 && !isNaN(parseInt(parts[3]))) {
      return parseInt(parts[3]);
    }
  }
  return 0;
};

export const generateGRNNumber = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const yy = now.getFullYear().toString().slice(-2);
    const prefix = `GRN-${mm}-${yy}`;

    const sequence = await getNextSequence(`grnNo-${mm}-${yy}`, seedGRNSequence(prefix));
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
      const rejectedQty = Number(item.rejectedQty) || 0;

      if (!item.itemDescription || isNaN(orderedQty) || isNaN(receivedQty) ||
          orderedQty < 0 || receivedQty < 0 || rejectedQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid item structure. Each item must have itemDescription, and valid numeric values for orderedQty, receivedQty, and rejectedQty"
        });
      }

      if (rejectedQty > 0 && !item.rejectionReason) {
        return res.status(400).json({
          success: false,
          message: `Item "${item.itemDescription}" has a rejected quantity of ${rejectedQty} but no rejectionReason was provided`
        });
      }

      item.rejectedQty = rejectedQty;
      item.acceptedQty = receivedQty;
    }

    const existingGRNs = await GRN.find({
      purchaseOrderId,
      isDeleted: { $ne: true }
    });

    let derivedJobId = purchaseOrder.jobId;
    if (!derivedJobId && purchaseOrder.purchaseId) {
      const linkedPurchase = await PurchaseRequest.findById(purchaseOrder.purchaseId);
      derivedJobId = linkedPurchase?.jobId;
    }

    const grnData: any = {
      grnNo,
      grnDate: new Date(grnDate),
      purchaseOrderId,
      warehouse,
      items,
      createdBy: employee._id
    };

    if (derivedJobId && mongoose.Types.ObjectId.isValid(derivedJobId)) {
      grnData.jobId = derivedJobId;
    }

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
      .populate('jobId')
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

      const existingStockEntry = await StockEntry.findOne({
        grn: grn._id,
        partNo: product._id,
        isDeleted: { $ne: true }
      });

      if (existingStockEntry) {
        warnings.push(`Item "${grnItem.itemDescription}" (index ${i + 1}) skipped: Stock entry for GRN "${grnNo}" and this part already exists`);
        continue;
      }

      const stockEntryData: any = {
        grn: grn._id,
        partNo: product._id,
        itemCode: product.itemCode || undefined,
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

    const rejectedItems = (items || []).filter((item: any) => Number(item.rejectedQty) > 0);
    if (rejectedItems.length > 0) {
      const socket = req.app.get('io') as Server;
      await createNotificationWithPrivileges(
        {
          type: 'GrnItemsRejected',
          referenceModel: 'GRN',
          title: 'GRN items rejected',
          message: `GRN ${grnNo} has ${rejectedItems.length} rejected item(s) from supplier ${populatedPurchaseOrder?.supplierId?.supplierName || ''}`.trim(),
          sentBy: employee._id?.toString(),
          referenceId: grn._id,
          additionalData: { grnId: grn._id.toString(), purchaseOrderId: purchaseOrderId?.toString() }
        },
        {
          privilegeKey: 'grn',
          checkFunction: (p: any) => p.grn?.viewReport && p.grn.viewReport !== 'none'
        },
        socket
      );
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
      .populate('jobId')
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
      .populate('jobId')
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

export const getGRNRejections = async (req: Request, res: Response) => {
  try {
    const { purchaseOrderId, supplierId } = req.query;

    const filter: any = { isDeleted: { $ne: true } };

    if (purchaseOrderId) {
      if (!mongoose.Types.ObjectId.isValid(purchaseOrderId as string)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Purchase Order ID"
        });
      }
      filter.purchaseOrderId = purchaseOrderId;
    }

    let grnQuery = GRN.find(filter)
      .populate('warehouse')
      .populate('receivedBy')
      .populate({
        path: 'purchaseOrderId',
        populate: [{ path: 'supplierId' }]
      })
      .populate('createdBy')
      .sort({ createdAt: -1 });

    let grns = await grnQuery;

    if (supplierId) {
      if (!mongoose.Types.ObjectId.isValid(supplierId as string)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Supplier ID"
        });
      }
      grns = grns.filter((grn: any) => {
        const po = grn.purchaseOrderId as any;
        const grnSupplierId = po?.supplierId?._id || po?.supplierId;
        return grnSupplierId && grnSupplierId.toString() === supplierId;
      });
    }

    const grnIds = grns.map((grn: any) => grn._id);
    const existingReturns = await SupplierReturn.find({ grnId: { $in: grnIds }, isDeleted: { $ne: true } });
    const initiatedByGrnAndItem = new Map<string, number>();
    existingReturns.forEach((r: any) => {
      const key = `${r.grnId.toString()}_${r.itemId}`;
      initiatedByGrnAndItem.set(key, (initiatedByGrnAndItem.get(key) || 0) + (r.rejectedQty || 0));
    });

    const rejections = grns
      .map((grn: any) => {
        const rejectedItems = (grn.items || [])
          .map((item: any, itemIndex: number) => ({ ...(item.toObject ? item.toObject() : item), itemIndex }))
          .map((item: any) => {
            const alreadyInitiated = initiatedByGrnAndItem.get(`${grn._id.toString()}_${item.itemIndex}`) || 0;
            return { ...item, rejectedQty: Number(item.rejectedQty || 0) - alreadyInitiated };
          })
          .filter((item: any) => Number(item.rejectedQty) > 0);
        if (rejectedItems.length === 0) {
          return null;
        }
        return {
          grnId: grn._id,
          grnNo: grn.grnNo,
          grnDate: grn.grnDate,
          purchaseOrderId: grn.purchaseOrderId,
          warehouse: grn.warehouse,
          receivedBy: grn.receivedBy,
          createdBy: grn.createdBy,
          items: rejectedItems
        };
      })
      .filter((entry: any) => entry !== null);

    return res.status(200).json({
      success: true,
      data: rejections
    });
  } catch (error: any) {
    console.error("Get GRN rejections error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch GRN rejections",
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
      .populate('jobId')
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

export const getAllGRNs = async (req: Request, res: Response) => {
  try {
    const { page = 1, row = 10, search = "" } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(row);
    const skip = (pageNumber - 1) * pageSize;

    const pipeline: any[] = [
      { $match: { isDeleted: { $ne: true } } },
      {
        $lookup: {
          from: "purchaseorders",
          localField: "purchaseOrderId",
          foreignField: "_id",
          as: "purchaseOrderId"
        }
      },
      { $unwind: { path: "$purchaseOrderId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "suppliers",
          localField: "purchaseOrderId.supplierId",
          foreignField: "_id",
          as: "purchaseOrderId.supplierId"
        }
      },
      { $unwind: { path: "$purchaseOrderId.supplierId", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "purchases",
          localField: "purchaseOrderId.purchaseId",
          foreignField: "_id",
          as: "purchaseOrderId.purchaseId"
        }
      },
      { $unwind: { path: "$purchaseOrderId.purchaseId", preserveNullAndEmptyArrays: true } },
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
          from: "warehouses",
          localField: "warehouse",
          foreignField: "_id",
          as: "warehouse"
        }
      },
      { $unwind: { path: "$warehouse", preserveNullAndEmptyArrays: true } },
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
        $lookup: {
          from: "employees",
          localField: "receivedBy",
          foreignField: "_id",
          as: "receivedBy"
        }
      },
      { $unwind: { path: "$receivedBy", preserveNullAndEmptyArrays: true } },
      ...(search ? [{
        $match: {
          $or: [
            { "grnNo": { $regex: search, $options: "i" } },
            { "purchaseOrderId.poNo": { $regex: search, $options: "i" } },
            { "purchaseOrderId.purchaseId.purchaseNo": { $regex: search, $options: "i" } },
            { "purchaseOrderId.supplierId.supplierName": { $regex: search, $options: "i" } },
            { "jobId.jobId": { $regex: search, $options: "i" } }
          ]
        }
      }] : []),
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

    const result = await GRN.aggregate(pipeline);
    const grns = result[0].data;
    const totalItems = result[0].totalCount[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: grns,
      pagination: {
        total: totalItems,
        page: pageNumber,
        pageSize: pageSize,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error: any) {
    console.error("Get all GRNs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch GRNs",
      error: error.message,
    });
  }
};

export const updateGRNSupplierInvoices = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const invoiceFiles = req.files;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GRN ID"
      });
    }

    let supplierInvoices = [];

    if (invoiceFiles && invoiceFiles.length > 0) {
      supplierInvoices = await Promise.all(invoiceFiles.map(async (file: any) => {
        await uploadFileToAws(file.filename, file.path);
        return { fileName: file.filename, originalname: file.originalname };
      }));
    }

    if (req.body.existingFiles) {
      let existingFiles = [];
      try {
        existingFiles = typeof req.body.existingFiles === 'string'
          ? JSON.parse(req.body.existingFiles)
          : req.body.existingFiles;
        supplierInvoices = [...supplierInvoices, ...existingFiles];
      } catch (error) {
        console.error("Error parsing existingFiles:", error);
      }
    }

    const updatedGrn = await GRN.findByIdAndUpdate(
      id,
      {
        $set: {
          supplierInvoices: supplierInvoices
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedGrn) {
      return res.status(404).json({
        success: false,
        message: "GRN not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Supplier invoices updated successfully",
      data: updatedGrn,
    });
  } catch (error: any) {
    console.error("Update GRN supplier invoices error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update supplier invoices",
      error: error.message,
    });
  }
};

export const updateGRNSupplierDeliveryNotes = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const deliveryNoteFiles = req.files;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GRN ID"
      });
    }

    let supplierDeliveryNotes = [];

    if (deliveryNoteFiles && deliveryNoteFiles.length > 0) {
      supplierDeliveryNotes = await Promise.all(deliveryNoteFiles.map(async (file: any) => {
        await uploadFileToAws(file.filename, file.path);
        return { fileName: file.filename, originalname: file.originalname };
      }));
    }

    if (req.body.existingFiles) {
      let existingFiles = [];
      try {
        existingFiles = typeof req.body.existingFiles === 'string'
          ? JSON.parse(req.body.existingFiles)
          : req.body.existingFiles;
        supplierDeliveryNotes = [...supplierDeliveryNotes, ...existingFiles];
      } catch (error) {
        console.error("Error parsing existingFiles:", error);
      }
    }

    const updatedGrn = await GRN.findByIdAndUpdate(
      id,
      {
        $set: {
          supplierDeliveryNotes: supplierDeliveryNotes
        }
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedGrn) {
      return res.status(404).json({
        success: false,
        message: "GRN not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Supplier delivery notes updated successfully",
      data: updatedGrn,
    });
  } catch (error: any) {
    console.error("Update GRN supplier delivery notes error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update supplier delivery notes",
      error: error.message,
    });
  }
};

