import { Request, Response } from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import GRN from "../models/grn.model";
import Product from "../models/products.model";
import StockEntry from "../models/stockEntry.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import { StockHold } from "../models/stockHold.model";
import { CreditNote } from "../models/creditNote.model";
import { getNextSequence } from "../models/counter.model";
import { getEmployeeData } from "../common/utils/util";
import { createNotificationWithPrivileges } from "./notification.controller";

const hasStockHoldPrivilege = (employee: any, action: 'canInitiateHold' | 'canIssueCreditNote' | 'canCreateReplacementLPO'): boolean => {
  const privileges = employee.category?.privileges;
  if (privileges?.stockHold?.[action]) {
    return true;
  }
  const grnPrivilege = privileges?.grn;
  return !!(grnPrivilege?.viewReport && grnPrivilege.viewReport !== 'none');
};

const seedHoldSequence = (prefix: string) => async (): Promise<number> => {
  const lastEntry = await StockHold.findOne({
    holdNo: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  if (lastEntry && (lastEntry as any).holdNo) {
    const parts = (lastEntry as any).holdNo.split('-');
    if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
      return parseInt(parts[2]);
    }
  }
  return 0;
};

const seedCreditNoteSequence = (prefix: string) => async (): Promise<number> => {
  const lastEntry = await CreditNote.findOne({
    creditNoteNo: new RegExp(`^${prefix}`)
  }).sort({ createdAt: -1 });

  if (lastEntry && (lastEntry as any).creditNoteNo) {
    const parts = (lastEntry as any).creditNoteNo.split('-');
    if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
      return parseInt(parts[2]);
    }
  }
  return 0;
};

const resolveUnitCost = (po: any, product: any, grnItem: any): number => {
  const matchingLpoItem = (po?.items || []).find((lpoItem: any) => {
    const lpoPartNoId = typeof lpoItem.partNo === 'object' ? lpoItem.partNo?._id : lpoItem.partNo;
    return (lpoPartNoId && product?._id && lpoPartNoId.toString() === product._id.toString()) ||
      (lpoItem.detail && grnItem.itemDescription && lpoItem.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase());
  });
  return Number(matchingLpoItem?.unitCost) || 0;
};

/**
 * Creates a quarantined StockEntry representing rejected-and-awaiting-return
 * GRN stock. Rejected GRN qty never entered stock (see grn.controller createGRN,
 * which only stocks acceptedQty), so this is a fresh quarantine record.
 */
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

export const createStockHold = async (req: Request, res: Response) => {
  try {
    const { grnId, itemIndex, qty, logisticsType, trackingRef, courierName, dispatchDate } = req.body;

    if (!grnId || !mongoose.Types.ObjectId.isValid(grnId)) {
      return res.status(400).json({ success: false, message: 'Valid grnId is required' });
    }
    if (typeof itemIndex !== 'number') {
      return res.status(400).json({ success: false, message: 'itemIndex is required' });
    }
    if (!['PhysicalReturn', 'SupplierPickup', 'Courier', 'NoPhysicalReturn'].includes(logisticsType)) {
      return res.status(400).json({ success: false, message: 'Invalid logisticsType' });
    }

    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!hasStockHoldPrivilege(employee, 'canInitiateHold')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to initiate a stock hold' });
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

    const existingHolds = await StockHold.find({ grnId, itemId: String(itemIndex), isDeleted: { $ne: true } });
    const alreadyInitiated = existingHolds.reduce((sum, h: any) => sum + (h.rejectedQty || 0), 0);
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
    const prefix = `SH-${currentYear}`;
    const sequence = await getNextSequence(`stockHoldNo-${currentYear}`, seedHoldSequence(prefix));
    const holdNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;

    let stockEntryId: any = undefined;
    let unitCost = 0;
    if (logisticsType !== 'NoPhysicalReturn') {
      const stockEntry = await createQuarantineStockEntry(grn, grnItem, requestedQty, employee._id);
      stockEntryId = stockEntry._id;
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

    const partNo = typeof grnItem.partNo === 'string' ? grnItem.partNo : undefined;

    const stockHold = await StockHold.create({
      holdNo,
      stockEntryId,
      grnId,
      itemId: String(itemIndex),
      partNo,
      itemDescription: grnItem.itemDescription,
      supplierId,
      logisticsType,
      trackingRef: logisticsType === 'Courier' ? trackingRef : undefined,
      courierName: logisticsType === 'Courier' ? courierName : undefined,
      dispatchDate: dispatchDate ? new Date(dispatchDate) : undefined,
      rejectedQty: requestedQty,
      unresolvedQty: requestedQty,
      unitCost,
      status: logisticsType === 'NoPhysicalReturn' ? 'AwaitingReplacement' : 'AwaitingReturn',
      initiatedBy: employee._id
    });

    const socket = req.app.get('io') as Server;
    await createNotificationWithPrivileges(
      {
        type: 'StockHoldInitiated',
        referenceModel: 'StockHold',
        title: 'Stock hold initiated',
        message: `Stock hold ${holdNo} initiated for GRN ${grn.grnNo}`,
        sentBy: employee._id?.toString(),
        referenceId: stockHold._id,
        additionalData: { stockHoldId: stockHold._id.toString() }
      },
      {
        privilegeKey: 'stockHold',
        checkFunction: (p: any) => p.stockHold?.viewReport && p.stockHold.viewReport !== 'none'
      },
      socket
    );

    res.status(201).json({ success: true, data: stockHold });
  } catch (error: any) {
    console.error('Error creating stock hold:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create stock hold' });
  }
};

export const getStockHolds = async (req: Request, res: Response) => {
  try {
    const { stockEntryId, grnId, supplierId, status } = req.query;
    const filter: any = { isDeleted: { $ne: true } };
    if (stockEntryId && mongoose.Types.ObjectId.isValid(stockEntryId as string)) filter.stockEntryId = stockEntryId;
    if (grnId && mongoose.Types.ObjectId.isValid(grnId as string)) filter.grnId = grnId;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId as string)) filter.supplierId = supplierId;
    if (status) filter.status = status;

    const holds = await StockHold.find(filter)
      .populate('supplierId')
      .populate('grnId')
      .populate('replacementPoId')
      .populate('initiatedBy')
      .populate('disputedBy')
      .populate('disputeResolvedBy')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: holds });
  } catch (error: any) {
    console.error('Error fetching stock holds:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stock holds' });
  }
};

export const getStockHoldById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    const hold = await StockHold.findById(id)
      .populate('supplierId')
      .populate('grnId')
      .populate('replacementPoId')
      .populate('initiatedBy')
      .populate('disputedBy')
      .populate('disputeResolvedBy');
    if (!hold || (hold as any).isDeleted) {
      return res.status(404).json({ success: false, message: 'Stock hold not found' });
    }
    res.status(200).json({ success: true, data: hold });
  } catch (error: any) {
    console.error('Error fetching stock hold:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stock hold' });
  }
};

/**
 * Applies one resolution pass to a StockHold (may be partial).
 * resolutionType: Replacement | AlternateSupplierSourcing | CreditOnly | Disposed
 */
export const resolveStockHold = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { qty, resolutionType, replacementPoId, note, poId, invoiced } = req.body;

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
    if (!hasStockHoldPrivilege(employee, 'canInitiateHold')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to resolve a stock hold' });
    }

    const hold: any = await StockHold.findById(id);
    if (!hold || hold.isDeleted) {
      return res.status(404).json({ success: false, message: 'Stock hold not found' });
    }
    if (hold.disputeStatus === 'SupplierDisputed') {
      return res.status(400).json({ success: false, message: 'Cannot resolve a hold while the supplier dispute is unresolved' });
    }

    const resolveQty = qty ? Number(qty) : hold.unresolvedQty;
    if (resolveQty <= 0 || resolveQty > hold.unresolvedQty) {
      return res.status(400).json({
        success: false,
        message: `resolveQty must be between 1 and ${hold.unresolvedQty} (remaining unresolved qty)`
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
      hold.replacementPoId = replacementPoId;
    }

    // CreditOnly / Disposed settle the financial side immediately; Replacement / AlternateSupplierSourcing
    // may also carry a financial component if the resolveQty isn't fully covered by physical replacement.
    if (resolutionType === 'CreditOnly' || resolutionType === 'Disposed') {
      const unitPrice = hold.unitCost || 0;
      const amount = unitPrice * resolveQty;

      if (invoiced && poId) {
        if (!mongoose.Types.ObjectId.isValid(poId)) {
          return res.status(400).json({ success: false, message: 'Valid poId is required to issue a CreditNote' });
        }
        if (!hasStockHoldPrivilege(employee, 'canIssueCreditNote')) {
          return res.status(403).json({ success: false, message: 'You do not have permission to issue a credit note' });
        }
        const currentYear = new Date().getFullYear();
        const prefix = `CN-SH-${currentYear}`;
        const sequence = await getNextSequence(`creditNoteNo-${currentYear}`, seedCreditNoteSequence(prefix));
        const creditNoteNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;

        const creditNote = await CreditNote.create({
          creditNoteNo,
          poId,
          grnId: hold.grnId,
          supplierId: hold.supplierId,
          items: [{
            itemId: hold.itemId,
            description: hold.itemDescription,
            rejectedQty: resolveQty,
            unitPrice,
            amount
          }],
          totalAmount: amount,
          reason: note || `Stock hold ${hold.holdNo} — ${resolutionType}`,
          createdBy: employee._id
        });

        hold.financialResolution = {
          type: 'CreditNote',
          creditNoteId: creditNote._id,
          adjustedAmount: amount,
          date: new Date()
        };
      } else {
        // Pre-invoice: reduce amount owed for reporting purposes without mutating the PO itself —
        // the StockHold record is the audit trail (mirrors CreditNote's non-mutation principle).
        hold.financialResolution = {
          type: 'PreInvoiceAdjustment',
          adjustedAmount: amount,
          date: new Date()
        };
      }
    }

    if (['Replacement', 'AlternateSupplierSourcing', 'CreditOnly', 'Disposed'].includes(resolutionType) && hold.stockEntryId) {
      // Physical resolution: replacement goods will be received against a new/linked GRN separately,
      // or rejected stock leaves the warehouse (returned to supplier/disposed). Either way, the
      // quarantined qty is consumed here rather than restored to sellable stock. Only "add back to
      // stock entries" (a manual release) restores sellable stock — a separate action.
      const stockEntry = await StockEntry.findById(hold.stockEntryId);
      if (stockEntry) {
        stockEntry.quantity = Math.max(0, (stockEntry.quantity || 0) - resolveQty);
        (stockEntry as any).quarantineReleasedAt = new Date();
        (stockEntry as any).quarantineReleasedBy = employee._id;
        await stockEntry.save();
      }
    }

    hold.resolutionType = resolutionType;
    hold.resolvedQty = (hold.resolvedQty || 0) + resolveQty;
    hold.unresolvedQty = Math.max(0, hold.unresolvedQty - resolveQty);
    hold.resolutionHistory.push({
      qty: resolveQty,
      resolutionType,
      actionBy: employee._id,
      date: new Date(),
      note
    });
    hold.status = resolutionType === 'Disposed' && hold.unresolvedQty === 0
      ? 'Disposed'
      : hold.unresolvedQty === 0
        ? 'Resolved'
        : 'PartiallyResolved';

    await hold.save();

    res.status(200).json({ success: true, data: hold });
  } catch (error: any) {
    console.error('Error resolving stock hold:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to resolve stock hold' });
  }
};

export const disputeStockHold = async (req: Request, res: Response) => {
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
    if (!hasStockHoldPrivilege(employee, 'canInitiateHold')) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this stock hold' });
    }

    const hold: any = await StockHold.findById(id);
    if (!hold || hold.isDeleted) {
      return res.status(404).json({ success: false, message: 'Stock hold not found' });
    }

    hold.disputeStatus = disputeStatus;
    if (disputeStatus === 'SupplierDisputed') {
      hold.disputeNote = disputeNote;
      hold.disputedBy = employee._id;
      hold.disputedAt = new Date();
    } else if (disputeStatus === 'DisputeResolved') {
      hold.disputeResolutionNote = disputeNote;
      hold.disputeResolvedBy = employee._id;
      hold.disputeResolvedAt = new Date();
    }
    await hold.save();

    res.status(200).json({ success: true, data: hold });
  } catch (error: any) {
    console.error('Error updating stock hold dispute status:', error);
    res.status(500).json({ success: false, message: 'Failed to update dispute status' });
  }
};
