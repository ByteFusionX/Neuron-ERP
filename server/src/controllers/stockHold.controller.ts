import { Request, Response } from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import GRN from "../models/grn.model";
import Product from "../models/products.model";
import { balanceOf, post as postStock } from "../services/stock.service";
import StockMovement from "../models/stockMovement.model";
import PurchaseOrder from "../models/purchaseOrder.model";
import DeliveryNote from "../models/deliveryNote.model";
import { resolveDeliveryProduct } from "./deliveryNote.controller";
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

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Same product resolution as createGRN: the LPO line's catalogue link, then part number, then exact description. */
const resolveGrnProduct = async (grn: any, grnItem: any): Promise<any> => {
  const po = grn.purchaseOrderId as any;
  const description = String(grnItem.itemDescription || '').trim();
  const lpoLine = description
    ? (po?.items || []).find((l: any) => l.detail && l.detail.trim().toLowerCase() === description.toLowerCase())
    : null;
  let product: any = lpoLine?.partNo ? await Product.findOne({ _id: lpoLine.partNo, isDeleted: { $ne: true } }) : null;
  const partNoStr = typeof grnItem.partNo === 'string' ? grnItem.partNo : (grnItem.partNo?.partNo || '');
  if (!product && partNoStr && partNoStr !== '-') {
    product = await Product.findOne({ partNo: new RegExp(`^${escapeRegex(partNoStr)}$`, 'i'), isDeleted: { $ne: true } });
  }
  if (!product && description) {
    product = await Product.findOne({ productDescription: new RegExp(`^${escapeRegex(description)}$`, 'i'), isDeleted: { $ne: true } });
  }
  return product;
};

/**
 * Returns the quarantine ledger row for a rejected GRN line. createGRN already posts the rejected qty to
 * Quarantine at receipt, so we link to that row; only if none exists (older GRNs) do we post a fresh one.
 */
const postQuarantine = async (grn: any, grnItem: any, qty: number, userId: string) => {
  const product = await resolveGrnProduct(grn, grnItem);
  if (!product) {
    throw new Error(`Product not found for "${grnItem.itemDescription || grnItem.partNo || 'N/A'}" — cannot quarantine rejected stock`);
  }

  const existing: any = await StockMovement.findOne({
    product: product._id,
    referenceId: grn._id,
    referenceType: { $in: ['GRN', 'GRN Rejection'] },
    bucket: 'Quarantine',
    direction: 'in',
  }).sort({ createdAt: 1 });
  if (existing) return existing;

  const po = grn.purchaseOrderId as any;
  const unitCost = resolveUnitCost(po, product, grnItem);

  return postStock({
    product: product._id,
    warehouse: grn.warehouse,
    type: 'Quarantine',
    direction: 'in',
    quantity: qty,
    bucket: 'Quarantine',
    unitCost,
    referenceType: 'GRN Rejection',
    referenceId: grn._id,
    referenceNo: grn.grnNo,
    reason: 'SupplierReturnPending',
    supplier: po?.supplierId?._id || po?.supplierId,
    lpoNo: po?.poNo,
    createdBy: userId,
  });
};

const REASON_CODES = ['Damaged', 'WrongItem', 'WrongSpec', 'ShortQty', 'Quality', 'Expired', 'Other'];

/**
 * DN items the customer rejected that still have qty not yet put on a hold. Each row carries the job and the
 * suppliers that supplied the product for that job (from the job's POs), so the hold can be raised against one.
 */
export const getDnRejections = async (_req: Request, res: Response) => {
  try {
    const dns: any[] = await DeliveryNote.find({ isDeleted: { $ne: true }, 'items.rejectedQty': { $gt: 0 } })
      .populate('jobId', 'jobId')
      .sort({ updatedAt: -1 })
      .lean();
    if (!dns.length) return res.json({ success: true, data: [] });

    const holds: any[] = await StockHold.find({ source: 'DN', dnId: { $in: dns.map((d) => d._id) }, isDeleted: { $ne: true } })
      .select('dnId dnItemId rejectedQty').lean();
    const heldQty = new Map<string, number>();
    holds.forEach((h) => {
      const key = `${h.dnId}-${h.dnItemId}`;
      heldQty.set(key, (heldQty.get(key) || 0) + (h.rejectedQty || 0));
    });

    const rows: any[] = [];
    for (const dn of dns) {
      const jobObjectId = dn.jobId?._id || dn.jobId;
      const jobPos: any[] = jobObjectId
        ? await PurchaseOrder.find({ jobId: jobObjectId, poStatus: { $nin: ['Cancelled', 'Rejected'] } })
          .select('poNo supplierId items.partNo').populate('supplierId', 'supplierName').lean()
        : [];
      for (const item of dn.items || []) {
        const rejected = Number(item.rejectedQty) || 0;
        if (rejected <= 0) continue;
        const open = rejected - (heldQty.get(`${dn._id}-${item._id}`) || 0);
        if (open <= 0) continue;
        const product: any = await resolveDeliveryProduct(item);
        const suppliers = new Map<string, { _id: string; supplierName: string }>();
        if (product) {
          jobPos
            .filter((po) => (po.items || []).some((l: any) => String(l.partNo) === String(product._id)))
            .forEach((po) => {
              const s = po.supplierId;
              if (s?._id) suppliers.set(String(s._id), { _id: String(s._id), supplierName: s.supplierName });
            });
        }
        rows.push({
          dnId: dn._id,
          dnNo: dn.dnNo,
          dnDate: dn.dnDate,
          jobId: jobObjectId,
          jobNo: dn.jobId?.jobId,
          dnItemId: String(item._id),
          partNo: item.partNo,
          itemDescription: item.description,
          productLinked: !!product,
          rejectedQty: open,
          rejectionReason: item.rejectionReason || '',
          suppliers: Array.from(suppliers.values()),
        });
      }
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching DN rejections:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch delivery note rejections' });
  }
};

/**
 * Hold for a quantity the customer rejected on a delivery note. The goods are already back in Quarantine
 * (applyDnItemRejections posted them), so this links to that row and keeps the job on the hold.
 */
const createDnStockHold = async (req: Request, res: Response, employee: any) => {
  const { dnId, dnItemId, qty, logisticsType, trackingRef, courierName, dispatchDate, vendorAuthorizationNo, returnReason, returnNotes, reasonCode, supplierId } = req.body;

  if (!dnId || !mongoose.Types.ObjectId.isValid(dnId)) {
    return res.status(400).json({ success: false, message: 'Valid dnId is required' });
  }
  if (!dnItemId) {
    return res.status(400).json({ success: false, message: 'dnItemId is required' });
  }
  if (!['PhysicalReturn', 'SupplierPickup', 'Courier'].includes(logisticsType)) {
    return res.status(400).json({ success: false, message: 'A delivery-note rejection is physically back in the warehouse, so choose a physical return method' });
  }
  if (reasonCode && !REASON_CODES.includes(reasonCode)) {
    return res.status(400).json({ success: false, message: 'Invalid reasonCode' });
  }
  if (supplierId && !mongoose.Types.ObjectId.isValid(supplierId)) {
    return res.status(400).json({ success: false, message: 'Invalid supplierId' });
  }

  const dn: any = await DeliveryNote.findById(dnId);
  if (!dn || dn.isDeleted) {
    return res.status(404).json({ success: false, message: 'Delivery Note not found' });
  }
  const dnItem: any = (dn.items as any[]).find((it: any) => it._id?.toString() === String(dnItemId) || it.itemId === String(dnItemId));
  if (!dnItem) {
    return res.status(404).json({ success: false, message: `Item "${dnItemId}" not found on this Delivery Note` });
  }
  const rejectedQty = Number(dnItem.rejectedQty) || 0;
  if (rejectedQty <= 0) {
    return res.status(400).json({ success: false, message: 'This delivery note item has no rejected quantity' });
  }

  const existingHolds = await StockHold.find({ dnId, dnItemId: String(dnItem._id), isDeleted: { $ne: true } });
  const alreadyInitiated = existingHolds.reduce((sum, h: any) => sum + (h.rejectedQty || 0), 0);
  const requestedQty = qty ? Number(qty) : rejectedQty - alreadyInitiated;
  if (requestedQty <= 0 || alreadyInitiated + requestedQty > rejectedQty) {
    return res.status(400).json({
      success: false,
      message: `Requested qty exceeds unresolved rejected qty (${rejectedQty - alreadyInitiated} remaining of ${rejectedQty})`
    });
  }

  const product = await resolveDeliveryProduct(dnItem);
  if (!product) {
    return res.status(400).json({ success: false, message: 'This delivery note item is not linked to a catalogue product, so its quarantine stock cannot be tracked' });
  }
  const quarantineRow: any = await StockMovement.findOne({
    product: product._id,
    referenceType: 'DnRejection',
    referenceId: dn._id,
    bucket: 'Quarantine',
    direction: 'in',
  }).sort({ createdAt: 1 });
  if (!quarantineRow) {
    return res.status(400).json({ success: false, message: 'No quarantine stock was recorded for this rejection, so there is nothing to hold' });
  }

  const currentYear = new Date().getFullYear();
  const prefix = `SH-${currentYear}`;
  const sequence = await getNextSequence(`stockHoldNo-${currentYear}`, seedHoldSequence(prefix));
  const holdNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;
  const returnNo = `PR-${currentYear}-${sequence.toString().padStart(4, '0')}`;

  const stockHold = await StockHold.create({
    holdNo,
    returnNo,
    source: 'DN',
    dnId: dn._id,
    dnItemId: String(dnItem._id),
    jobId: dn.jobId,
    productId: product._id,
    reasonCode: reasonCode || undefined,
    vendorAuthorizationNo: vendorAuthorizationNo || undefined,
    returnReason: returnReason || dnItem.rejectionReason || undefined,
    returnNotes: returnNotes || undefined,
    stockEntryId: quarantineRow._id,
    partNo: dnItem.partNo || product.partNo,
    itemDescription: dnItem.description,
    supplierId: supplierId || undefined,
    logisticsType,
    trackingRef: logisticsType === 'Courier' ? trackingRef : undefined,
    courierName: logisticsType === 'Courier' ? courierName : undefined,
    dispatchDate: dispatchDate ? new Date(dispatchDate) : undefined,
    rejectedQty: requestedQty,
    unresolvedQty: requestedQty,
    unitCost: quarantineRow.unitCost || 0,
    status: 'AwaitingReturn',
    initiatedBy: employee._id
  });

  const socket = req.app.get('io') as Server;
  await createNotificationWithPrivileges(
    {
      type: 'StockHoldInitiated',
      referenceModel: 'StockHold',
      title: 'Stock hold initiated',
      message: `Stock hold ${holdNo} initiated for rejected items on delivery note ${dn.dnNo}`,
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

  return res.status(201).json({ success: true, data: stockHold });
};

export const createStockHold = async (req: Request, res: Response) => {
  try {
    if (req.body?.source === 'DN') {
      const employee = await getEmployeeData(req.user);
      if (!employee) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!hasStockHoldPrivilege(employee, 'canInitiateHold')) {
        return res.status(403).json({ success: false, message: 'You do not have permission to initiate a stock hold' });
      }
      return await createDnStockHold(req, res, employee);
    }

    const {
      grnId,
      itemIndex,
      qty,
      logisticsType,
      trackingRef,
      courierName,
      dispatchDate,
      vendorAuthorizationNo,
      returnReason,
      returnNotes
    } = req.body;

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
      const product = await resolveGrnProduct(grn, grnItem);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `This GRN item is not linked to a catalogue product, so it cannot be quarantined for a physical return. Choose "No Physical Return (waived/disposed)" instead, or fix the product link first.`
        });
      }
    }

    const currentYear = new Date().getFullYear();
    const prefix = `SH-${currentYear}`;
    const sequence = await getNextSequence(`stockHoldNo-${currentYear}`, seedHoldSequence(prefix));
    const holdNo = `${prefix}-${sequence.toString().padStart(4, '0')}`;
    const returnNo = `PR-${currentYear}-${sequence.toString().padStart(4, '0')}`;

    let stockEntryId: any = undefined;
    let unitCost = 0;
    if (logisticsType !== 'NoPhysicalReturn') {
      // stockEntryId now points at the quarantine row in the stock ledger.
      const quarantineRow = await postQuarantine(grn, grnItem, requestedQty, employee._id);
      stockEntryId = quarantineRow._id;
      unitCost = quarantineRow.unitCost || 0;
    } else {
      const product = await resolveGrnProduct(grn, grnItem);
      unitCost = resolveUnitCost(po, product, grnItem);
    }

    const partNo = typeof grnItem.partNo === 'string' ? grnItem.partNo : undefined;

    const stockHold = await StockHold.create({
      holdNo,
      returnNo,
      vendorAuthorizationNo: vendorAuthorizationNo || undefined,
      returnReason: returnReason || grnItem.rejectionReason || undefined,
      returnNotes: returnNotes || undefined,
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
    const { stockEntryId, grnId, supplierId, status, dnId, jobId, source } = req.query;
    const filter: any = { isDeleted: { $ne: true } };
    if (dnId && mongoose.Types.ObjectId.isValid(dnId as string)) filter.dnId = dnId;
    if (jobId && mongoose.Types.ObjectId.isValid(jobId as string)) filter.jobId = jobId;
    if (source === 'GRN' || source === 'DN') filter.source = source;
    if (stockEntryId && mongoose.Types.ObjectId.isValid(stockEntryId as string)) filter.stockEntryId = stockEntryId;
    if (grnId && mongoose.Types.ObjectId.isValid(grnId as string)) filter.grnId = grnId;
    if (supplierId && mongoose.Types.ObjectId.isValid(supplierId as string)) filter.supplierId = supplierId;
    if (status) filter.status = status;

    const holds = await StockHold.find(filter)
      .populate('supplierId')
      .populate('grnId')
      .populate('dnId', 'dnNo dnDate')
      .populate('jobId', 'jobId')
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
      .populate('dnId', 'dnNo dnDate')
      .populate('jobId', 'jobId')
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
      const po: any = await PurchaseOrder.findById(replacementPoId);
      if (!po) {
        return res.status(404).json({ success: false, message: 'Replacement Purchase Order not found' });
      }
      if (['Cancelled', 'Rejected', 'Closed'].includes(po.poStatus)) {
        return res.status(400).json({ success: false, message: `Replacement PO ${po.poNo} is ${po.poStatus}` });
      }
      // Replacement must come from the same supplier; alternate sourcing must come from a different one.
      if (hold.supplierId && po.supplierId) {
        const sameSupplier = String(po.supplierId) === String(hold.supplierId);
        if (resolutionType === 'Replacement' && !sameSupplier) {
          return res.status(400).json({ success: false, message: `Replacement PO ${po.poNo} is for a different supplier` });
        }
        if (resolutionType === 'AlternateSupplierSourcing' && sameSupplier) {
          return res.status(400).json({ success: false, message: `Alternate sourcing PO ${po.poNo} is for the same supplier as the hold` });
        }
      }
      if (hold.source === 'DN' && hold.jobId && po.jobId && String(po.jobId) !== String(hold.jobId)) {
        return res.status(400).json({ success: false, message: `PO ${po.poNo} is for a different job` });
      }
      // The PO must carry a live line for the held product with enough open quantity.
      const productKey = hold.productId ? String(hold.productId) : null;
      const lines = (po.items || []).filter((l: any) => productKey
        ? String(l.partNo) === productKey
        : (hold.itemDescription && l.detail === hold.itemDescription));
      if (!lines.length) {
        return res.status(400).json({ success: false, message: `PO ${po.poNo} has no line for this item` });
      }
      const lineQty = lines.reduce((s: number, l: any) => s + Math.max(0, Number(l.quantity) || 0), 0);
      // Quantity already claimed on this PO by other holds' replacement passes.
      const others: any[] = await StockHold.find({ _id: { $ne: hold._id }, replacementPoId: po._id, isDeleted: { $ne: true } }).lean();
      const claimed = others.reduce((s, h) => s + (h.resolutionHistory || [])
        .filter((r: any) => r.resolutionType === 'Replacement' || r.resolutionType === 'AlternateSupplierSourcing')
        .reduce((a: number, r: any) => a + (r.qty || 0), 0), 0);
      if (claimed + resolveQty > lineQty) {
        return res.status(400).json({
          success: false,
          message: `PO ${po.poNo} covers ${lineQty} for this item, ${claimed} already claimed by other holds; cannot cover ${resolveQty} more`
        });
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
      // quarantined qty is taken out of quarantine here rather than restored to sellable stock.
      const quarantineRow: any = await StockMovement.findById(hold.stockEntryId).lean();
      if (quarantineRow) {
        const inQuarantine = await balanceOf(quarantineRow.product, quarantineRow.warehouse, 'Quarantine');
        const take = Math.min(resolveQty, inQuarantine);
        if (take > 0) {
          await postStock({
            product: quarantineRow.product,
            warehouse: quarantineRow.warehouse,
            type: 'Return',
            direction: 'out',
            quantity: take,
            bucket: 'Quarantine',
            unitCost: quarantineRow.unitCost,
            referenceType: 'StockHold',
            referenceId: hold._id,
            referenceNo: hold.holdNo,
            reason: resolutionType,
            remarks: note,
            createdBy: employee._id,
          });
        }
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
