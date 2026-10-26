import { Request, Response } from "express";
import GRN from "../models/grn.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import { post as postStock } from "../services/stock.service";
import Product from "../models/products.model";
import { createPendingProduct } from "./productReview.controller";
import PurchaseRequest from "../models/purchaseRequest.model";
import mongoose from "mongoose";
import { getEmployeeData } from "../common/utils/util";
import { checkAndUpdateJobCompletionStatus } from "./job.controller";
import { uploadFileToAws } from "../common/aws-connect";
import { getNextSequence } from "../models/counter.model";
import { createNotificationWithPrivileges } from "./notification.controller";
import { Server } from "socket.io";
import { StockHold } from "../models/stockHold.model";
import { logAudit } from "../services/audit.service";

const logGrnAudit = (req: Request, grn: any, action: string, summary: string, changes?: { label: string; from?: string; to?: string }[]) =>
  logAudit(req, { entityType: 'grn', entityId: grn._id, entityLabel: grn.grnNo, action, summary, changes });

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

const nextGRNNo = async () => {
  const now = new Date();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const yy = now.getFullYear().toString().slice(-2);
  const prefix = `GRN-${mm}-${yy}`;
  const sequence = await getNextSequence(`grnNo-${mm}-${yy}`, seedGRNSequence(prefix));
  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

// Preview only: the number is taken when the GRN is saved, so opening the form no longer uses one up.
export const generateGRNNumber = async (req: Request, res: Response) => {
  return res.status(200).json({ grn: null, message: "Assigned on save" });
};

export const createGRN = async (req: Request, res: Response) => {
  try {
    const {
      grnDate,
      purchaseOrderId,
      supplierInvoiceNo,
      supplierInvoiceDate,
      supplierDeliveryNoteNo,
      receivedBy,
      warehouse,
      destinationType = 'warehouse', siteName, quarantineWarehouse,
      inspectionResult = 'Passed', inspectionDate, inspectionNotes, inspectedBy,
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
    if (!['Placed', 'Closed'].includes(purchaseOrder.poStatus as string)) {
      return res.status(409).json({
        success: false,
        message: "Goods can only be received against a placed LPO"
      });
    }

    if (!grnDate || !warehouse || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: grnDate, warehouse, and items are required"
      });
    }

    if (!String(supplierDeliveryNoteNo ?? '').trim()) {
      return res.status(400).json({ success: false, message: "Supplier delivery note no. is required" });
    }

    if (!['warehouse', 'site'].includes(destinationType) || (destinationType === 'site' && !siteName)) {
      return res.status(400).json({ success: false, message: "A valid destination and project / site are required" });
    }
    if (!['Pending', 'Passed', 'Partial', 'Failed'].includes(inspectionResult)) {
      return res.status(400).json({ success: false, message: "Invalid inspection result" });
    }

    for (const item of items) {
      const orderedQty = Number(item.orderedQty);
      const receivedQty = Number(item.receivedQty);
      const acceptedQty = Number(item.acceptedQty);
      const rejectedQty = Number(item.rejectedQty) || 0;

      if (!item.itemDescription || isNaN(orderedQty) || isNaN(receivedQty) || isNaN(acceptedQty) ||
          orderedQty < 0 || receivedQty < 0 || acceptedQty < 0 || rejectedQty < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid item structure. Each item must have itemDescription, and valid numeric values for orderedQty, receivedQty, and rejectedQty"
        });
      }

      if (Math.abs((acceptedQty + rejectedQty) - receivedQty) > 0.000001) {
        return res.status(400).json({ success: false, message: `Item "${item.itemDescription}" must satisfy Accepted Qty + Rejected Qty = Received Qty` });
      }

      const quantityVariance = Number(item.quantityVariance) || 0;
      if (rejectedQty > 0 || quantityVariance !== 0) {
        item.discrepancyType = quantityVariance < 0 ? 'Shortage' : quantityVariance > 0 ? 'Excess' : 'Damaged';
        item.rejectionReason = quantityVariance !== 0
          ? `Quantity variance: ${quantityVariance}`
          : `${rejectedQty} unit(s) rejected`;
      }

      item.rejectedQty = rejectedQty;
      item.acceptedQty = acceptedQty;
      item.quantityVariance = quantityVariance;
      item.serialNos = Array.isArray(item.serialNos)
        ? item.serialNos.map((serial: any) => String(serial).trim()).filter(Boolean)
        : String(item.serialNos || '').split(/[\n,;]+/).map((serial: string) => serial.trim()).filter(Boolean);
      if (item.trackingType === 'Batch' && acceptedQty > 0 && !item.batchNo) {
        return res.status(400).json({ success: false, message: `Item "${item.itemDescription}" requires a batch / lot number` });
      }
      if (item.trackingType === 'Serial' && acceptedQty > 0 && new Set(item.serialNos).size !== acceptedQty) {
        return res.status(400).json({ success: false, message: `Item "${item.itemDescription}" requires ${acceptedQty} unique serial number(s)` });
      }
    }

    const existingGRNs = await GRN.find({
      purchaseOrderId,
      isDeleted: { $ne: true }
    });

    // Accepted stock can't go past what is still open on the line; any extra must be booked as rejected.
    const sameLine = (a: any, b: any) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    for (const item of items) {
      const lpoLine: any = (purchaseOrder.items || []).find((line: any) => sameLine(line.detail, item.itemDescription));
      if (!lpoLine) continue;
      const alreadyAccepted = existingGRNs.reduce((sum, g: any) => sum + (g.items || [])
        .filter((gi: any) => sameLine(gi.itemDescription, item.itemDescription))
        .reduce((s: number, gi: any) => s + (Number(gi.acceptedQty) || 0), 0), 0);
      const open = Math.max(0, (Number(lpoLine.quantity) || 0) - alreadyAccepted);
      if (Number(item.acceptedQty) > open + 0.000001) {
        return res.status(400).json({
          success: false,
          message: `"${item.itemDescription}": only ${open} still open on the LPO, but ${item.acceptedQty} accepted. Book the extra as rejected (Excess) so it is returned.`
        });
      }
    }

    let derivedJobId = purchaseOrder.jobId;
    if (!derivedJobId && purchaseOrder.purchaseId) {
      const linkedPurchase = await PurchaseRequest.findById(purchaseOrder.purchaseId);
      derivedJobId = linkedPurchase?.jobId;
    }

    const grnNo = await nextGRNNo();
    const grnData: any = {
      grnNo,
      grnDate: new Date(grnDate),
      purchaseOrderId,
      warehouse,
      destinationType,
      siteName: destinationType === 'site' ? siteName : undefined,
      quarantineWarehouse: quarantineWarehouse || undefined,
      inspectionResult,
      inspectionDate: inspectionDate ? new Date(inspectionDate) : undefined,
      inspectionNotes: inspectionNotes || undefined,
      inspectedBy: inspectedBy || undefined,
      outcomeStatus: items.some((item: any) => Number(item.rejectedQty) > 0) ? 'Return Required' : 'Completed',
      invoiceStatus: items.some((item: any) => Number(item.rejectedQty) > 0) ? 'Blocked by Return' : 'Ready for Invoice',
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
      .populate('receivedBy', '-password')
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
      .populate('createdBy', '-password');

    const warnings: string[] = [];
    const populatedPurchaseOrder = populatedGrn.purchaseOrderId as any;

    for (let i = 0; i < items.length; i++) {
      const grnItem = items[i];
      const acceptedQty = Number(grnItem.acceptedQty);
      const rejectedQty = Number(grnItem.rejectedQty) || 0;

      if (acceptedQty <= 0 && rejectedQty <= 0) {
        continue;
      }

      const description = String(grnItem.itemDescription || '').trim();
      const partNoStr = String(typeof grnItem.partNo === 'string' ? grnItem.partNo : (grnItem.partNo?.partNo || '')).trim();
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const matchingLpoItem: any = (purchaseOrder.items || []).find((lpoItem: any) =>
        lpoItem.detail && description && lpoItem.detail.trim().toLowerCase() === description.toLowerCase());

      if (!matchingLpoItem) {
        warnings.push(`"${description}" was not added to stock: it does not match any line on the LPO`);
        continue;
      }

      // Product: the LPO line's link, then the part number, then an exact description match. Job/PR lines
      // often have no product, so a pending product is created and linked to the LPO line for next time.
      let product: any = matchingLpoItem.partNo ? await Product.findOne({ _id: matchingLpoItem.partNo, isDeleted: { $ne: true } }) : null;
      if (!product && partNoStr && partNoStr !== '-') {
        product = await Product.findOne({ partNo: new RegExp(`^${escape(partNoStr)}$`, 'i'), isDeleted: { $ne: true } });
      }
      if (!product && description) {
        product = await Product.findOne({ productDescription: new RegExp(`^${escape(description)}$`, 'i'), isDeleted: { $ne: true } });
      }
      if (!product) {
        const created = await createPendingProduct({ partNo: partNoStr === '-' ? '' : partNoStr, productDescription: description, isGeneric: !partNoStr || partNoStr === '-' }, 'GRN', employee._id);
        product = created.status === 'created' ? created.product
          : created.status === 'duplicate' && created.existing?._id ? await Product.findById(created.existing._id) : null;
        if (product) warnings.push(`"${description}" was added to stock as a new product waiting for review`);
      }
      if (!product) {
        warnings.push(`"${description}" was not added to stock: no product could be found or created`);
        continue;
      }
      if (!matchingLpoItem.partNo) {
        const lineIndex = purchaseOrder.items.indexOf(matchingLpoItem);
        await PurchaseOrder.updateOne({ _id: purchaseOrderId }, { $set: { [`items.${lineIndex}.partNo`]: product._id } });
        matchingLpoItem.partNo = product._id;
      }

      const unitCost = Number(matchingLpoItem.unitCost) || 0;

      const commonStockData = {
        product: product._id,
        unitCost,
        referenceType: 'GRN',
        referenceId: grn._id,
        referenceNo: grnNo,
        supplier: populatedPurchaseOrder?.supplierId?._id || populatedPurchaseOrder?.supplierId,
        lpoNo: populatedPurchaseOrder?.poNo || undefined,
        remarks: grnItem.remarks,
        movementDate: new Date(grnDate),
        createdBy: employee._id,
      };

      if (acceptedQty > 0) {
        await postStock({ ...commonStockData, warehouse, type: 'Receipt', direction: 'in', quantity: acceptedQty });
      }
      if (rejectedQty > 0) {
        await postStock({
          ...commonStockData,
          warehouse: quarantineWarehouse || warehouse,
          type: 'Quarantine',
          direction: 'in',
          quantity: rejectedQty,
          bucket: 'Quarantine',
          reason: grnItem.rejectionReason || grnItem.discrepancyType,
        });
      }
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
                if (!grn.inspectionResult || ['Passed', 'Partial'].includes(grn.inspectionResult)) {
                  totalAcceptedQty += Number(grnItem.acceptedQty) || 0;
                }
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
    const totalAccepted = items.reduce((s: number, i: any) => s + (Number(i.acceptedQty) || 0), 0);
    const totalRejected = items.reduce((s: number, i: any) => s + (Number(i.rejectedQty) || 0), 0);
    await logGrnAudit(req, grn, 'created',
      `Goods received against ${populatedPurchaseOrder?.poNo || 'LPO'}: ${totalAccepted} accepted${totalRejected ? `, ${totalRejected} rejected (return required)` : ''}`);
    if (allItemsFullyReceived && lpoItems.length > 0) {
      await logGrnAudit(req, grn, 'lpo-closed', `${populatedPurchaseOrder?.poNo || 'LPO'} fully received and closed`);
    }
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
      .populate('receivedBy', '-password')
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
      .populate('createdBy', '-password')
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
      .populate('receivedBy', '-password')
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
      .populate('createdBy', '-password')
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
      .populate('receivedBy', '-password')
      .populate({
        path: 'purchaseOrderId',
        populate: [{ path: 'supplierId' }]
      })
      .populate('createdBy', '-password')
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
    const existingHolds = await StockHold.find({ grnId: { $in: grnIds }, isDeleted: { $ne: true } });
    const initiatedByGrnAndItem = new Map<string, number>();
    existingHolds.forEach((r: any) => {
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
      .populate('receivedBy', '-password')
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
      .populate('createdBy', '-password');

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

/** Placed LPOs still waiting on goods, soonest expected first: the GRN Arriving tab. */
export const getArrivingPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const pageNumber = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Number(req.query.row) || 15);
    const search = String(req.query.search || '').trim();
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stage = String(req.query.stage || '');
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const result = await PurchaseOrder.aggregate([
      { $match: { poStatus: 'Placed' } },
      { $lookup: { from: "grns", let: { po: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$purchaseOrderId", "$$po"] }, isDeleted: { $ne: true } } }, { $project: { items: 1 } }], as: "grns" } },
      {
        $addFields: {
          orderedQty: { $sum: "$items.quantity" },
          receivedQty: { $sum: { $map: { input: "$grns", as: "g", in: { $sum: "$$g.items.receivedQty" } } } },
          // Rejected goods still owe a replacement, so the LPO stays here until everything ordered is accepted.
          acceptedQty: { $sum: { $map: { input: "$grns", as: "g", in: { $sum: "$$g.items.acceptedQty" } } } },
          grnCount: { $size: "$grns" },
        }
      },
      { $match: { $expr: { $lt: ["$acceptedQty", "$orderedQty"] } } },
      // Upcoming: expected after today and no GRN yet; once any GRN exists it is tracked in the other tabs.
      // Arriving: due today, overdue, or no date given.
      ...(stage === 'upcoming' ? [{ $match: { expectedDeliveryDate: { $gte: startOfTomorrow }, grnCount: 0 } }] : []),
      ...(stage === 'arriving' ? [{ $match: { $or: [{ expectedDeliveryDate: { $lt: startOfTomorrow } }, { expectedDeliveryDate: null }, { expectedDeliveryDate: { $exists: false } }] } }] : []),
      { $lookup: { from: "suppliers", localField: "supplierId", foreignField: "_id", as: "supplierId", pipeline: [{ $project: { supplierName: 1 } }] } },
      { $unwind: { path: "$supplierId", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "purchases", localField: "purchaseId", foreignField: "_id", as: "purchaseId", pipeline: [{ $project: { purchaseNo: 1, jobId: 1 } }] } },
      { $unwind: { path: "$purchaseId", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", as: "jobId", pipeline: [{ $project: { jobId: 1 } }] } },
      { $unwind: { path: "$jobId", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "employees", localField: "placedBy", foreignField: "_id", as: "placedBy", pipeline: [{ $project: { firstName: 1, lastName: 1 } }] } },
      { $unwind: { path: "$placedBy", preserveNullAndEmptyArrays: true } },
      ...(search ? [{
        $match: {
          $or: [
            { poNo: { $regex: escaped, $options: "i" } },
            { "purchaseId.purchaseNo": { $regex: escaped, $options: "i" } },
            { "supplierId.supplierName": { $regex: escaped, $options: "i" } },
            { "jobId.jobId": { $regex: escaped, $options: "i" } },
          ]
        }
      }] : []),
      { $project: { grns: 0, approvalStatus: 0, approvedHistory: 0, rejectedHistory: 0, termsAndCondition: 0 } },
      // No date yet (placed before the date was asked for) sorts last.
      { $addFields: { sortDate: { $ifNull: ["$expectedDeliveryDate", new Date(8640000000000000)] } } },
      { $sort: { sortDate: 1, placedAt: 1 } },
      { $facet: { data: [{ $skip: (pageNumber - 1) * pageSize }, { $limit: pageSize }], totalCount: [{ $count: "count" }] } },
    ]);

    const total = result[0]?.totalCount[0]?.count || 0;
    return res.status(200).json({
      success: true,
      data: result[0]?.data || [],
      pagination: { total, page: pageNumber, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error: any) {
    console.error("Get arriving purchase orders error:", error);
    return res.status(500).json({ success: false, message: "Failed to load arriving LPOs", error: error.message });
  }
};

export const getAllGRNs = async (req: Request, res: Response) => {
  try {
    const { page = 1, row = 10, search = "", status = "" } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(row);
    const skip = (pageNumber - 1) * pageSize;
    const receiptStatus = String(status);

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
      // Older GRNs have no jobId of their own; fall back to the LPO's, then its purchase request's.
      { $addFields: { jobId: { $ifNull: ["$jobId", "$purchaseOrderId.jobId", "$purchaseOrderId.purchaseId.jobId"] } } },
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
          as: "createdBy",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "employees",
          localField: "receivedBy",
          foreignField: "_id",
          as: "receivedBy",
          pipeline: [{ $project: { password: 0 } }]
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
      {
        $addFields: {
          receiptStatus: {
            $let: {
              vars: {
                received: { $sum: { $map: { input: { $ifNull: ["$items", []] }, as: "item", in: { $ifNull: ["$$item.receivedQty", 0] } } } }
              },
              in: {
                $switch: {
                  branches: [
                    { case: { $lte: ["$$received", 0] }, then: "pending" },
                    // Judged on the whole LPO: a split delivery is fully received once the LPO closes.
                    { case: { $ne: ["$purchaseOrderId.poStatus", "Closed"] }, then: "partial" }
                  ],
                  default: "arrived"
                }
              }
            }
          }
        }
      },
      ...(["pending", "partial", "arrived"].includes(receiptStatus)
        ? [{ $match: { receiptStatus } }]
        : []),
      ...(receiptStatus === "returns"
        ? [{
            $match: {
              $or: [
                { outcomeStatus: { $in: ["Return Required", "Return in Progress", "Resolved"] } },
                {
                  $expr: {
                    $gt: [
                      { $sum: { $map: { input: { $ifNull: ["$items", []] }, as: "item", in: { $ifNull: ["$$item.rejectedQty", 0] } } } },
                      0
                    ]
                  }
                }
              ]
            }
          }]
        : []),
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

// Stock was already posted from the quantities, warehouse and batch/serial numbers at create time, so an edit
// only touches the paperwork and inspection fields plus the per-line notes; those other fields are ignored here.
export const updateGRN = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid GRN ID" });
    }

    const grn: any = await GRN.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!grn) {
      return res.status(404).json({ success: false, message: "GRN not found" });
    }

    const {
      grnDate, supplierInvoiceNo, supplierInvoiceDate, supplierDeliveryNoteNo, receivedBy,
      siteName, quarantineWarehouse, inspectionResult, inspectionDate, inspectionNotes, inspectedBy, items
    } = req.body;

    if (!grnDate || !String(supplierDeliveryNoteNo ?? '').trim()) {
      return res.status(400).json({ success: false, message: "GRN date and supplier delivery note no. are required" });
    }
    if (inspectionResult && !['Pending', 'Passed', 'Partial', 'Failed'].includes(inspectionResult)) {
      return res.status(400).json({ success: false, message: "Invalid inspection result" });
    }
    if (grn.destinationType === 'site' && !siteName) {
      return res.status(400).json({ success: false, message: "Project / site is required" });
    }

    const day = (d: any) => d ? new Date(d).toISOString().slice(0, 10) : '';
    const diffs: { label: string; from?: string; to?: string }[] = [];
    const track = (label: string, from: any, to: any) => {
      if (String(from ?? '') !== String(to ?? '')) diffs.push({ label, from: String(from ?? '') || '—', to: String(to ?? '') || '—' });
    };
    track('GRN date', day(grn.grnDate), day(grnDate));
    track('Supplier delivery note no.', grn.supplierDeliveryNoteNo, supplierDeliveryNoteNo);
    track('Supplier invoice no.', grn.supplierInvoiceNo, supplierInvoiceNo);
    track('Supplier invoice date', day(grn.supplierInvoiceDate), day(supplierInvoiceDate));
    if (inspectionResult) track('Inspection result', grn.inspectionResult, inspectionResult);

    grn.grnDate = new Date(grnDate);
    grn.supplierInvoiceNo = supplierInvoiceNo || undefined;
    grn.supplierInvoiceDate = supplierInvoiceDate ? new Date(supplierInvoiceDate) : undefined;
    grn.supplierDeliveryNoteNo = supplierDeliveryNoteNo;
    if (receivedBy) grn.receivedBy = receivedBy;
    if (grn.destinationType === 'site') grn.siteName = siteName;
    grn.quarantineWarehouse = quarantineWarehouse || undefined;
    if (inspectionResult) grn.inspectionResult = inspectionResult;
    grn.inspectionDate = inspectionDate ? new Date(inspectionDate) : undefined;
    grn.inspectionNotes = inspectionNotes || undefined;
    grn.inspectedBy = inspectedBy || undefined;

    if (Array.isArray(items)) {
      for (let i = 0; i < grn.items.length; i++) {
        const line = grn.items[i];
        const incoming = items[i];
        if (!incoming) continue;
        const hasDiscrepancy = (Number(line.rejectedQty) || 0) > 0 || (Number(line.quantityVariance) || 0) !== 0;
        line.discrepancyType = hasDiscrepancy ? (incoming.discrepancyType || line.discrepancyType) : undefined;
        line.rejectionReason = hasDiscrepancy ? (incoming.rejectionReason || line.rejectionReason) : undefined;
        line.expiryDate = incoming.expiryDate ? new Date(incoming.expiryDate) : undefined;
        line.remarks = incoming.remarks || undefined;
        if (incoming.uom) line.uom = incoming.uom;
      }
    }

    await grn.save();
    if (diffs.length) await logGrnAudit(req, grn, 'updated', 'GRN details edited', diffs);
    return res.status(200).json({ success: true, message: "GRN updated", data: grn });
  } catch (error: any) {
    console.error("Update GRN error:", error);
    return res.status(500).json({ success: false, message: "Failed to update GRN", error: error.message });
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

    await logGrnAudit(req, updatedGrn, 'invoice-files', `Supplier invoice files updated (${supplierInvoices.length} file${supplierInvoices.length === 1 ? '' : 's'})`);
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

    await logGrnAudit(req, updatedGrn, 'delivery-note-files', `Supplier delivery note files updated (${supplierDeliveryNotes.length} file${supplierDeliveryNotes.length === 1 ? '' : 's'})`);
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
