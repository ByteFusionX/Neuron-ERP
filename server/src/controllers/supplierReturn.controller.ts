import { Request, Response } from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import GRN from "../models/grn.model";
import Product from "../models/products.model";
import StockEntry from "../models/stockEntry.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import { SupplierReturn } from "../models/supplierReturn.model";
import { DebitNote } from "../models/debitNote.model";
import { getNextSequence } from "../models/counter.model";
import { getEmployeeData } from "../common/utils/util";
import { createNotificationWithPrivileges } from "./notification.controller";

// supplierReturn privileges aren't yet assignable in category management, so
// fall back to full supplierReturn access for anyone with GRN view access.
const hasSupplierReturnPrivilege = (employee: any, action: 'canInitiateReturn' | 'canIssueDebitNote' | 'canCreateReplacementLPO'): boolean => {
  const privileges = employee.category?.privileges;
  if (privileges?.supplierReturn?.[action]) {
    return true;
  }
  const grnPrivilege = privileges?.grn;
  return !!(grnPrivilege?.viewReport && grnPrivilege.viewReport !== 'none');
};

const seedSupplierReturnSequence = (prefix: string) => async (): Promise<number> => {
  const lastEntry = await SupplierReturn.findOne({
    supplierReturnNo: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  if (lastEntry && (lastEntry as any).supplierReturnNo) {
    const parts = (lastEntry as any).supplierReturnNo.split('-');
    if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
      return parseInt(parts[2]);
    }
  }
  return 0;
};

const seedDebitNoteSequence = (prefix: string) => async (): Promise<number> => {
  const lastEntry = await DebitNote.findOne({
    debitNoteNo: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  if (lastEntry && (lastEntry as any).debitNoteNo) {
    const parts = (lastEntry as any).debitNoteNo.split('-');
    if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
      return parseInt(parts[2]);
    }
  }
  return 0;
};

/**
 * Creates a quarantined StockEntry representing rejected-and-awaiting-return
 * GRN stock. Unlike the DN-rejection quarantine restore, there is no prior
 * StockEntry to draw from — rejected GRN qty never entered stock (see grn.controller
 * createGRN, which only stocks acceptedQty) — so this is a fresh quarantine record.
 */
const resolveUnitCost = (po: any, product: any, grnItem: any): number => {
  const matchingLpoItem = (po?.items || []).find((lpoItem: any) => {
    const lpoPartNoId = typeof lpoItem.partNo === 'object' ? lpoItem.partNo?._id : lpoItem.partNo;
    return (lpoPartNoId && product?._id && lpoPartNoId.toString() === product._id.toString()) ||
      (lpoItem.detail && grnItem.itemDescription && lpoItem.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase());
  });
  return Number(matchingLpoItem?.unitCost) || 0;
};

const createQuarantineStockEntry = async (grn: any, grnItem: any, qty: number, userId: string) => {
  let product: any = null;
  if (grnItem.partNo) {
    const partNoStr = typeof grnItem.partNo === 'string' ? grnItem.partNo : (grnItem.partNo?.partNo || '');
    if (partNoStr && partNoStr !== '-') {
      product = await Product.findOne({ partNo: new RegExp(`^${partNoStr}$`, 'i'), isDeleted: { $ne: true } });
    }
  }
  if (!product) {
    throw new Error(`Product not found for part number "${grnItem.partNo || 'N/A'}" — cannot quarantine rejected stock`);
  }

  const po = grn.purchaseOrderId as any;
  const unitCost = resolveUnitCost(po, product, grnItem);

  const stockEntry = await StockEntry.create({
    grn: grn._id,
    partNo: product._id,
    itemCode: product.itemCode || undefined,
    dateOfPurchase: new Date(),
    jobId: grn.jobId,
    supplierName: po?.supplierId?._id || po?.supplierId,
    supplierLpoNo: po?.poNo,
    productDescription: grnItem.itemDescription,
    productSegment: product.productSegment,
    productCategory: product.productCategory,
    targetWarehouse: grn.warehouse,
    quantity: qty,
    uom: grnItem.uom,
    unitCost,
    totalCost: unitCost * qty,
    isQuarantined: true,
    quarantineReason: 'SupplierReturnPending',
    quarantinedAt: new Date(),
    createdBy: userId,
    createdDate: new Date(),
    updatedDate: new Date(),
    isDeleted: false
  });

  return stockEntry;
};

export const createSupplierReturn = async (req: Request, res: Response) => {
  try {
    const { grnId, itemIndex, qty, logisticsType, trackingRef, courierName, dispatchDate } = req.body;

    if (!grnId || !mongoose.Types.ObjectId.isValid(grnId)) {
      return res.status(400).json({ success: false, message: 'Valid grnId is required' });
    }
    if (typeof itemIndex !== 'number') {
      return res.status(400).json({ success: false, message: 'itemIndex is required' });
    }
    if (!['SupplierPickup', 'Courier', 'NoPhysicalReturn'].includes(logisticsType)) {
      return res.status(400).json({ success: false, message: 'Invalid logisticsType' });
    }

    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!hasSupplierReturnPrivilege(employee, 'canInitiateReturn')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to initiate a supplier return' });
    }

    const grn = await GRN.findById(grnId).populate({ path: 'purchaseOrderId', populate: [{ path: 'supplierId' }] });
    if (!grn || (grn as any).isDeleted) {
      return res.status(404).json({ success: false, message: 'GRN not found' });
    }

    const grnItem: any = (grn.items as any[])[itemIndex];
    if (!grnItem) {
      return res.status(404).json({ success: false, message: `No GRN item at index ${itemIndex}` });
    }
    const rejectedQty = Number(grnItem.rejectedQty) || 0;
    if (rejectedQty <= 0) {
      return res.status(400).json({ success: false, message: 'This GRN item has no rejected quantity' });
    }

    const existingReturns = await SupplierReturn.find({ grnId, itemId: String(itemIndex), isDeleted: { $ne: true } });
    const alreadyInitiated = existingReturns.reduce((sum, r: any) => sum + (r.rejectedQty || 0), 0);
    const requestedQty = qty ? Number(qty) : rejectedQty - alreadyInitiated;

    if (requestedQty <= 0 || alreadyInitiated + requestedQty > rejectedQty) {
      return res.status(400).json({
        success: false,
        message: `Requested qty exceeds unresolved rejected qty (${rejectedQty - alreadyInitiated} remaining of ${rejectedQty})`
      });
    }

    const po = grn.purchaseOrderId as any;
    const supplierId = po?.supplierId?._id || po?.supplierId;
    if (!supplierId) {
      return res.status(400).json({ success: false, message: 'Could not resolve supplier from linked Purchase Order' });
    }

    if (logisticsType !== 'NoPhysicalReturn') {
      const partNoStr = typeof grnItem.partNo === 'string' ? grnItem.partNo : (grnItem.partNo?.partNo || '');
      const product = partNoStr && partNoStr !== '-'
        ? await Product.findOne({ partNo: new RegExp(`^${partNoStr}$`, 'i'), isDeleted: { $ne: true } })
        : null;
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `This GRN item has no valid part number on record, so it cannot be quarantined for a physical return. Choose "No Physical Return (waived/disposed)" instead, or correct the part number on the GRN first.`
        });
      }
    }

    const currentYear = new Date().getFullYear();
    const prefix = `SR-${currentYear}`;
    const sequence = await getNextSequence(`supplierReturnNo-${currentYear}`, seedSupplierReturnSequence(prefix));
    const supplierReturnNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;

    let quarantineStockEntryId: any = undefined;
    let unitCost = 0;
    if (logisticsType !== 'NoPhysicalReturn') {
      const stockEntry = await createQuarantineStockEntry(grn, grnItem, requestedQty, employee._id);
      quarantineStockEntryId = stockEntry._id;
      unitCost = stockEntry.unitCost || 0;
    } else {
      let product: any = null;
      if (grnItem.partNo) {
        const partNoStr = typeof grnItem.partNo === 'string' ? grnItem.partNo : (grnItem.partNo?.partNo || '');
        if (partNoStr && partNoStr !== '-') {
          product = await Product.findOne({ partNo: new RegExp(`^${partNoStr}$`, 'i'), isDeleted: { $ne: true } });
        }
      }
      unitCost = resolveUnitCost(po, product, grnItem);
    }

    const supplierReturn = await SupplierReturn.create({
      supplierReturnNo,
      grnId,
      itemId: String(itemIndex),
      partNo: typeof grnItem.partNo === 'string' ? grnItem.partNo : undefined,
      itemDescription: grnItem.itemDescription,
      rejectedQty: requestedQty,
      unresolvedQty: requestedQty,
      unitCost,
      supplierId,
      logisticsType,
      trackingRef: logisticsType === 'Courier' ? trackingRef : undefined,
      courierName: logisticsType === 'Courier' ? courierName : undefined,
      dispatchDate: dispatchDate ? new Date(dispatchDate) : undefined,
      quarantineStockEntryId,
      status: logisticsType === 'NoPhysicalReturn' ? 'AwaitingReplacement' : 'AwaitingReturn',
      initiatedBy: employee._id
    });

    const socket = req.app.get('io') as Server;
    await createNotificationWithPrivileges(
      {
        type: 'SupplierReturnInitiated',
        referenceModel: 'SupplierReturn',
        title: 'Supplier return initiated',
        message: `Supplier return ${supplierReturnNo} initiated for GRN ${grn.grnNo}`,
        sentBy: employee._id?.toString(),
        referenceId: supplierReturn._id,
        additionalData: { supplierReturnId: supplierReturn._id.toString() }
      },
      {
        privilegeKey: 'supplierReturn',
        checkFunction: (p: any) => p.supplierReturn?.viewReport && p.supplierReturn.viewReport !== 'none'
      },
      socket
    );

    res.status(201).json({ success: true, data: supplierReturn });
  } catch (error: any) {
    console.error('Error creating supplier return:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create supplier return' });
  }
};

export const getSupplierReturns = async (req: Request, res: Response) => {
  try {
    const { grnId, supplierId, status } = req.query;
    const filter: any = { isDeleted: { $ne: true } };
    if (grnId && mongoose.Types.ObjectId.isValid(grnId as string)) filter.grnId = grnId;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId as string)) filter.supplierId = supplierId;
    if (status) filter.status = status;

    const returns = await SupplierReturn.find(filter)
      .populate('supplierId')
      .populate('grnId')
      .populate('replacementPoId')
      .populate('initiatedBy')
      .populate('disputedBy')
      .populate('disputeResolvedBy')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: returns });
  } catch (error: any) {
    console.error('Error fetching supplier returns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier returns' });
  }
};

export const getSupplierReturnById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const supplierReturn = await SupplierReturn.findById(id)
      .populate('supplierId')
      .populate('grnId')
      .populate('replacementPoId')
      .populate('initiatedBy')
      .populate('disputedBy')
      .populate('disputeResolvedBy');
    if (!supplierReturn || (supplierReturn as any).isDeleted) {
      return res.status(404).json({ success: false, message: 'Supplier return not found' });
    }
    res.status(200).json({ success: true, data: supplierReturn });
  } catch (error: any) {
    console.error('Error fetching supplier return:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch supplier return' });
  }
};

/**
 * Applies one resolution pass to a SupplierReturn (may be partial — see S6).
 * resolutionType: Replacement | AlternateSupplierSourcing | CreditOnly | Disposed
 */
export const resolveSupplierReturn = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { qty, resolutionType, replacementPoId, note, financialType, poId, invoiced } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    if (!['Replacement', 'AlternateSupplierSourcing', 'CreditOnly', 'Disposed'].includes(resolutionType)) {
      return res.status(400).json({ success: false, message: 'Invalid resolutionType' });
    }

    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!hasSupplierReturnPrivilege(employee, 'canInitiateReturn')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to resolve a supplier return' });
    }

    const supplierReturn: any = await SupplierReturn.findById(id);
    if (!supplierReturn || supplierReturn.isDeleted) {
      return res.status(404).json({ success: false, message: 'Supplier return not found' });
    }
    if (supplierReturn.disputeStatus === 'SupplierDisputed') {
      return res.status(400).json({ success: false, message: 'Cannot resolve a return while the supplier dispute is unresolved' });
    }

    const resolveQty = qty ? Number(qty) : supplierReturn.unresolvedQty;
    if (resolveQty <= 0 || resolveQty > supplierReturn.unresolvedQty) {
      return res.status(400).json({
        success: false,
        message: `resolveQty must be between 1 and ${supplierReturn.unresolvedQty} (remaining unresolved qty)`
      });
    }

    if ((resolutionType === 'Replacement' || resolutionType === 'AlternateSupplierSourcing') && replacementPoId) {
      if (!mongoose.Types.ObjectId.isValid(replacementPoId)) {
        return res.status(400).json({ success: false, message: 'Invalid replacementPoId' });
      }
      const po = await PurchaseOrder.findById(replacementPoId);
      if (!po) {
        return res.status(404).json({ success: false, message: 'Replacement Purchase Order not found' });
      }
      supplierReturn.replacementPoId = replacementPoId;
    }

    // CreditOnly / Disposed settle the financial side immediately; Replacement / AlternateSupplierSourcing
    // may also carry a financial component if the resolveQty isn't fully covered by physical replacement.
    if (resolutionType === 'CreditOnly' || resolutionType === 'Disposed') {
      const unitPrice = supplierReturn.unitCost || 0;
      const amount = unitPrice * resolveQty;

      if (invoiced && poId) {
        if (!mongoose.Types.ObjectId.isValid(poId)) {
          return res.status(400).json({ success: false, message: 'Valid poId is required to issue a DebitNote' });
        }
        if (!hasSupplierReturnPrivilege(employee, 'canIssueDebitNote')) {
          return res.status(403).json({ success: false, message: 'You do not have permission to issue a debit note' });
        }
        const currentYear = new Date().getFullYear();
        const prefix = `DN-SR-${currentYear}`;
        const sequence = await getNextSequence(`debitNoteNo-${currentYear}`, seedDebitNoteSequence(prefix));
        const debitNoteNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;

        const debitNote = await DebitNote.create({
          debitNoteNo,
          poId,
          grnId: supplierReturn.grnId,
          supplierId: supplierReturn.supplierId,
          supplierReturnId: supplierReturn._id,
          items: [{
            itemId: supplierReturn.itemId,
            description: supplierReturn.itemDescription,
            rejectedQty: resolveQty,
            unitPrice,
            amount
          }],
          totalAmount: amount,
          reason: note || `Supplier return ${supplierReturn.supplierReturnNo} — ${resolutionType}`,
          createdBy: employee._id
        });

        supplierReturn.financialResolution = {
          type: 'DebitNote',
          debitNoteId: debitNote._id,
          adjustedAmount: amount,
          date: new Date()
        };
      } else {
        // Pre-invoice: reduce amount owed for reporting purposes without mutating the PO itself —
        // the SupplierReturn record is the audit trail (mirrors CreditNote's non-mutation principle).
        supplierReturn.financialResolution = {
          type: 'PreInvoiceAdjustment',
          adjustedAmount: amount,
          date: new Date()
        };
      }

      if (supplierReturn.quarantineStockEntryId) {
        const stockEntry = await StockEntry.findById(supplierReturn.quarantineStockEntryId);
        if (stockEntry) {
          stockEntry.quantity = Math.max(0, (stockEntry.quantity || 0) - resolveQty);
          (stockEntry as any).quarantineReleasedAt = new Date();
          (stockEntry as any).quarantineReleasedBy = employee._id;
          await stockEntry.save();
        }
      }
    }

    if (resolutionType === 'Replacement' || resolutionType === 'AlternateSupplierSourcing') {
      // Physical resolution: replacement goods will be received against a new/linked GRN separately.
      // The quarantined qty represents rejected stock leaving the warehouse (returned to supplier),
      // so it's consumed here rather than restored to sellable stock.
      if (supplierReturn.quarantineStockEntryId) {
        const stockEntry = await StockEntry.findById(supplierReturn.quarantineStockEntryId);
        if (stockEntry) {
          stockEntry.quantity = Math.max(0, (stockEntry.quantity || 0) - resolveQty);
          (stockEntry as any).quarantineReleasedAt = new Date();
          (stockEntry as any).quarantineReleasedBy = employee._id;
          await stockEntry.save();
        }
      }
    }

    supplierReturn.resolutionType = resolutionType;
    supplierReturn.resolvedQty = (supplierReturn.resolvedQty || 0) + resolveQty;
    supplierReturn.unresolvedQty = Math.max(0, supplierReturn.unresolvedQty - resolveQty);
    supplierReturn.resolutionHistory.push({
      qty: resolveQty,
      resolutionType,
      actionBy: employee._id,
      date: new Date(),
      note
    });
    supplierReturn.status = resolutionType === 'Disposed' && supplierReturn.unresolvedQty === 0
      ? 'Disposed'
      : supplierReturn.unresolvedQty === 0
        ? 'Resolved'
        : 'PartiallyResolved';

    await supplierReturn.save();

    res.status(200).json({ success: true, data: supplierReturn });
  } catch (error: any) {
    console.error('Error resolving supplier return:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to resolve supplier return' });
  }
};

export const disputeSupplierReturn = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { disputeStatus, disputeNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    if (!['None', 'SupplierDisputed', 'DisputeResolved'].includes(disputeStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid disputeStatus' });
    }

    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!hasSupplierReturnPrivilege(employee, 'canInitiateReturn')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this supplier return' });
    }

    const supplierReturn: any = await SupplierReturn.findById(id);
    if (!supplierReturn || supplierReturn.isDeleted) {
      return res.status(404).json({ success: false, message: 'Supplier return not found' });
    }

    supplierReturn.disputeStatus = disputeStatus;
    if (disputeStatus === 'SupplierDisputed') {
      supplierReturn.disputeNote = disputeNote;
      supplierReturn.disputedBy = employee._id;
      supplierReturn.disputedAt = new Date();
    } else if (disputeStatus === 'DisputeResolved') {
      supplierReturn.disputeResolutionNote = disputeNote;
      supplierReturn.disputeResolvedBy = employee._id;
      supplierReturn.disputeResolvedAt = new Date();
    }
    await supplierReturn.save();

    res.status(200).json({ success: true, data: supplierReturn });
  } catch (error: any) {
    console.error('Error updating supplier return dispute status:', error);
    res.status(500).json({ success: false, message: 'Failed to update dispute status' });
  }
};
