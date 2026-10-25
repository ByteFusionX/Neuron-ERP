import { Request, Response, NextFunction } from "express";
import PurchaseOrder from "../models/purchaseOrder.model";
import GRN from "../models/grn.model";
import purchaseRequest from "../models/purchaseRequest.model"
import Supplier from "../models/supplier.model";
import Quotation from "../models/quotation.model";
import Rfq, { RfqType } from "../models/rfq.model";
import jobModel from "../models/job.model";
import mongoose from "mongoose";
import { getEmployeeData, buildPrivilegeAccessFilter } from "../common/utils/util";
import { uploadFileToAws, deleteFileFromAws } from "../common/aws-connect";
import { getNextSequence } from "../models/counter.model";
import { checkAndUpdateJobCompletionStatus } from "./job.controller";
import { Server } from "socket.io";
import { createNotificationWithPrivileges } from "./notification.controller";
import Employee from "../models/employee.model";
import { getWorkflowSteps, updateApprovalStatus, rebuildPendingRoute } from "../services/workflow.service";
import { recordPrices } from "../services/supplierPrice.service";
import { notifyByPrivilege } from "../services/notify.service";
import { SupplierPriceSource } from "../models/supplierPrice.model";

// LPO approval runs on its own "poApproval" workflow (Settings > Workflow > PO Approval); the amount is the LPO total after discount.
const PO_WORKFLOW = 'poApproval';
const lpoApprovalContext = (po: any) => {
  const subTotal = (po?.items || []).reduce((sum: number, item: any) => sum + (Number(item.totalCost) || 0), 0);
  return { amount: subTotal - (Number(po?.discount) || 0) };
};

// updateApprovalStatus wraps its errors as "Error: <message>"; strip that so the user sees the plain reason.
const plainError = (error: any) => String(error?.message ?? error).replace(/^(Error:\s*)+/, '');

const notifyLpoApprovers = async (po: any, sentBy: any, socket: Server) => {
  const pending = (po.approvalStatus || [])
    .filter((approval: any) => approval.status === 'pending')
    .sort((a: any, b: any) => a.step - b.step);
  const stage = pending.filter((approval: any) => approval.step === pending[0]?.step);

  const approverIds = new Set<string>();
  const managerIds = new Set<string>();
  for (const approval of stage) {
    if (approval.managerApproval && approval.approver) {
      approverIds.add(approval.approver.toString());
      managerIds.add(approval.approver.toString());
    } else if (approval.role) {
      const roleId = approval.role?._id?.toString() || approval.role.toString();
      const holders = await Employee.find({ category: roleId, isDeleted: { $ne: true }, isBlocked: { $ne: true } }).select('_id').lean();
      holders.forEach((holder: any) => approverIds.add(holder._id.toString()));
    }
  }
  if (!approverIds.size) return;

  await createNotificationWithPrivileges(
    {
      type: 'LpoApprovalRequest',
      referenceModel: 'PurchaseOrder',
      title: 'LPO awaiting your approval',
      message: `LPO ${po.poNo} is awaiting your approval`,
      sentBy: sentBy?.toString(),
      referenceId: po._id,
      additionalData: { purchaseId: po.purchaseId?.toString() }
    },
    {
      privilegeKey: 'purchaseOrder',
      checkFunction: (p, employeeId) =>
        !!employeeId && approverIds.has(employeeId) && (managerIds.has(employeeId) || p.purchaseOrder?.canApprovePOs === true)
    },
    socket
  );
};

/**
 * The suppliers a PR line is ordered from: its selected comparisons, or, when nobody was chosen, the line's own
 * supplier at the line cost (the PR submit gate accepts such a line, so it must be orderable too). A short line orders nothing.
 */
const lineSuppliers = (detail: any): { supplierId: any; quantity: number; unitPrice: number; comparison: any }[] => {
  const won = (detail.comparisons || []).filter((c: any) => c.selected === true && c.supplierId);
  if (won.length) return won.map((c: any) => ({ supplierId: c.supplierId, quantity: Number(c.quantity ?? detail.quantity) || 0, unitPrice: Number(c.unitPrice) || 0, comparison: c }));
  if (detail.short || !detail.supplierId || !(Number(detail.unitCost) > 0)) return [];
  const own = (detail.comparisons || []).find((c: any) => String(c.supplierId) === String(detail.supplierId));
  return [{ supplierId: detail.supplierId, quantity: Number(detail.quantity) || 0, unitPrice: Number(detail.unitCost), comparison: own || {} }];
};

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
      poStatus,
      originalPoId,
      stockHoldId,
    } = req.body;
    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);
    
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    if (!privileges?.purchaseOrder?.canInitiateLPO) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to initiate LPO and issue PO",
      });
    }

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

    // An LPO is only raised against a fully approved PR; a step still waiting (or escalated) blocks it.
    const prStillPending = (existingPurchaseRequest.approvalStatus || []).some((approval: any) => approval.status === 'pending');
    if (existingPurchaseRequest.status !== 'Approved' || prStillPending) {
      return res.status(409).json({
        success: false,
        message: "This purchase request is not fully approved yet, so an LPO cannot be raised",
      });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }
    if (supplier.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "This supplier is blocked and cannot be used for a new purchase order",
      });
    }
    if (supplier.status !== "Approved") {
      return res.status(403).json({
        success: false,
        message: `This supplier is not approved (status: ${supplier.status}) and cannot be used for a new purchase order`,
      });
    }

    // Quantities are checked per PR line (prLineKey = PR itemDetail _id), so two lines with the same part stay apart.
    // An item without prLineKey (older payloads) falls back to the first awarded line with the same part/detail.
    const itemKey = (entry: any) => (entry.partNo ? entry.partNo.toString() : entry.detail);
    const allowedByItem = new Map<string, number>();
    const lineByItemKey = new Map<string, string>();
    (existingPurchaseRequest.items || []).forEach((item: any) => {
      (item.itemDetails || []).forEach((detail: any) => {
        const selected = lineSuppliers(detail).find((entry) => String(entry.supplierId) === supplierId.toString());
        if (!selected) return;
        const key = String(detail._id);
        allowedByItem.set(key, (allowedByItem.get(key) || 0) + selected.quantity);
        if (!lineByItemKey.has(itemKey(detail))) lineByItemKey.set(itemKey(detail), key);
      });
    });
    const lineKeyOf = (entry: any) => (entry.prLineKey ? String(entry.prLineKey) : lineByItemKey.get(itemKey(entry)) || itemKey(entry));
    const existingOrders = await PurchaseOrder.find({
      purchaseId: new mongoose.Types.ObjectId(purchaseId),
      supplierId: new mongoose.Types.ObjectId(supplierId),
      poStatus: { $nin: ['Draft', 'Rejected', 'Cancelled'] }
    });
    const reservedByItem = new Map<string, number>();
    existingOrders.forEach((po: any) => {
      (po.items || []).forEach((item: any) => {
        const key = lineKeyOf(item);
        reservedByItem.set(key, (reservedByItem.get(key) || 0) + (Number(item.quantity) || 0));
      });
    });
    const requestedByItem = new Map<string, number>();
    items.forEach((item: any) => {
      item.prLineKey = lineKeyOf(item);
      const key = item.prLineKey;
      requestedByItem.set(key, (requestedByItem.get(key) || 0) + (Number(item.quantity) || 0));
    });
    for (const [key, requestedQty] of requestedByItem.entries()) {
      const allowedQty = allowedByItem.get(key) || 0;
      const reservedQty = reservedByItem.get(key) || 0;
      if (requestedQty > Math.max(0, allowedQty - reservedQty)) {
        return res.status(400).json({
          success: false,
          message: "PO quantity exceeds the remaining approved PR quantity for one or more items",
        });
      }
    }

    let currency;
    if (existingPurchaseRequest.currency) {
      currency = existingPurchaseRequest.currency;
    } else if (quoteId) {
      const quotation = await Quotation.findById(quoteId);
      if (quotation && quotation.currency) {
        currency = quotation.currency;
      }
    } else if (jobId) {
      const job = await jobModel.findById(jobId);
      if (job && job.quoteId) {
        const quotation = await Quotation.findById(job.quoteId);
        if (quotation && quotation.currency) {
          currency = quotation.currency;
        }
      }
    }

    // Create purchase order data with validated fields
    const purchaseOrderData: any = {
      poNo,
      items,
      supplierId,
      purchaseId,
      jobId,
      quoteId,
      // The schema requires ETA, but a supplier offer may not give one; fall back to the delivery terms.
      etaTerms: etaTerms || deliveryTerms || 'As per terms',
      paymentTerms: paymentTerms || '',
      shippingTerms: shippingTerms || '',
      deliveryTerms: deliveryTerms || '',
      placeOfDelivery: placeOfDelivery || '',
      subject: subject || '',
      poDate: poDate ? new Date(poDate) : new Date(),
      termsAndCondition: termsAndCondition || '',
      discount: discount || 0,
      poStatus: 'Pending for Approval',
      createdBy: employee._id,
    };

    if (currency) {
      purchaseOrderData.currency = currency;
    }
    if (originalPoId && mongoose.Types.ObjectId.isValid(originalPoId)) {
      purchaseOrderData.originalPoId = originalPoId;
    }
    if (stockHoldId && mongoose.Types.ObjectId.isValid(stockHoldId)) {
      purchaseOrderData.stockHoldId = stockHoldId;
    }

    const rfqId = await resolvePoRfqId(purchaseId, quoteId, supplierId);
    if (rfqId) purchaseOrderData.rfqId = rfqId;

    // Each line points at the awarded quote it came from: same PR line, same supplier, selected.
    if (purchaseId && mongoose.Types.ObjectId.isValid(purchaseId)) {
      const rfqs: any[] = await Rfq.find(
        { purchaseRequestId: purchaseId, rfqType: { $ne: RfqType.Sales }, isDeleted: false, status: { $ne: 'Cancelled' } },
        { quotes: 1 }
      ).lean();
      const quoteByLine = new Map<string, any>();
      rfqs.forEach((rfq) => (rfq.quotes || []).forEach((q: any) => {
        if (q.selected && String(q.supplierId) === String(supplierId) && !quoteByLine.has(String(q.itemDetailKey))) {
          quoteByLine.set(String(q.itemDetailKey), q._id);
        }
      }));
      items.forEach((item: any) => {
        const quoteId = quoteByLine.get(String(item.prLineKey));
        if (quoteId) item.rfqQuoteId = quoteId;
      });
    }

    // The issued LPO goes to the PO Approval workflow. With no matching steps (limits / requester is Admin) there is nothing to approve.
    let workflowSteps: any[];
    try {
      workflowSteps = await getWorkflowSteps(PO_WORKFLOW, employee._id.toString(), lpoApprovalContext(purchaseOrderData));
    } catch (workflowError) {
      console.error('Error initializing LPO workflow steps:', workflowError);
      return res.status(500).json({ success: false, message: "Could not start the PO approval workflow. Check Settings > Workflow > PO Approval." });
    }
    purchaseOrderData.approvalStatus = workflowSteps;
    if (workflowSteps.length === 0) purchaseOrderData.poStatus = 'Approved';

    const purchaseOrder = new PurchaseOrder(purchaseOrderData);
    await purchaseOrder.save();

    // The PO price becomes the supplier's last price for each product, ahead of any comparison price.
    await recordPrices(
      items.map((item: any) => ({ supplierId, productId: item.partNo, price: Number(item.unitCost) })),
      SupplierPriceSource.PO,
      { currency: String(purchaseOrder.currency || existingPurchaseRequest.currency), sourceNo: poNo, sourceId: purchaseOrder._id, employeeId: employee._id }
    );

    const socket = req.app.get('io') as Server;
    if (purchaseOrder.poStatus === 'Pending for Approval') {
      await notifyLpoApprovers(purchaseOrder, employee._id, socket);
    }

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
    return res.status(400).json({
      success: false,
      message: "Purchase orders cannot be edited after PR approval. Use re-issue, approval, status, or invoice actions instead.",
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

export const reissuePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // originalItems/supplierId are excluded from updateData so they never get
    // persisted onto the PO document; they're no longer needed for
    // issuedQuantity bookkeeping (see comment below).
    const { items, supplierId: _supplierId, originalItems: _originalItems, ...updateData } = req.body;

    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    if (!privileges?.purchaseOrder?.canReissueAndRevoke) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to re-issue purchase orders",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PurchaseOrder ID",
      });
    }

    const existingOrder = await PurchaseOrder.findById(id);
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (!updateData.currency && !existingOrder.currency) {
      const purchaseRequestDoc = await purchaseRequest.findById(existingOrder.purchaseId);
      if (purchaseRequestDoc && purchaseRequestDoc.currency) {
        updateData.currency = purchaseRequestDoc.currency;
      } else if (existingOrder.quoteId) {
        const quotation = await Quotation.findById(existingOrder.quoteId);
        if (quotation && quotation.currency) {
          updateData.currency = quotation.currency;
        }
      } else if (existingOrder.jobId) {
        const job = await jobModel.findById(existingOrder.jobId);
        if (job && job.quoteId) {
          const quotation = await Quotation.findById(job.quoteId);
          if (quotation && quotation.currency) {
            updateData.currency = quotation.currency;
          }
        }
      }
    }

    // Update the purchase order
    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      {
        ...updateData,
        items,
        updatedAt: new Date()
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    // No issuedQuantity bookkeeping needed here: reissue updates this same
    // PO document's items in place, so the next derived-sum read (see
    // getSuppliersForPurchaseRequest / getItemsForPurchaseRequest) picks up
    // the new quantities automatically.

    return res.status(200).json({
      success: true,
      message: "Purchase order re-issued successfully",
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error("Reissue PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to re-issue purchase order",
      error: error.message,
    });
  }
};

export const getPurchaseOrderByPoNo = async (req: Request, res: Response) => {
  try {
    const { poNo } = req.params;

    const purchaseOrder = await PurchaseOrder.findOne({ poNo })
      .populate("supplierId")
      .populate("items.partNo")
      .populate("jobId", "jobId");

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    return res.status(200).json({ success: true, data: purchaseOrder });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch purchase order" });
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

    const objectId = new mongoose.Types.ObjectId(id);

    const result = await PurchaseOrder.aggregate([
      {
        $match: { _id: objectId }
      },
      // Supplier
      {
        $lookup: {
          from: "suppliers",
          localField: "supplierId",
          foreignField: "_id",
          as: "supplierId"
        }
      },
      { $unwind: { path: "$supplierId", preserveNullAndEmptyArrays: true } },

      // Purchase Request
      {
        $lookup: {
          from: "purchases",
          localField: "purchaseId",
          foreignField: "_id",
          as: "purchaseId"
        }
      },
      { $unwind: { path: "$purchaseId", preserveNullAndEmptyArrays: true } },

      // Job for the purchase request
      {
        $lookup: {
          from: "jobs",
          localField: "purchaseId.jobId",
          foreignField: "_id",
          as: "purchaseId.jobId"
        }
      },
      { $unwind: { path: "$purchaseId.jobId", preserveNullAndEmptyArrays: true } },

      // Quotation (either directly from LPO.quoteId or via Job.quoteId)
      {
        $lookup: {
          from: "quotations",
          localField: "purchaseId.jobId.quoteId",
          foreignField: "_id",
          as: "jobQuote"
        }
      },
      { $unwind: { path: "$jobQuote", preserveNullAndEmptyArrays: true } },
      // PO's own quoteId is a raw ObjectId; resolve it so $mergeObjects below gets an object
      {
        $lookup: {
          from: "quotations",
          localField: "quoteId",
          foreignField: "_id",
          as: "directQuote"
        }
      },
      { $unwind: { path: "$directQuote", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          quoteId: { $ifNull: ["$directQuote", "$jobQuote"] }
        }
      },
      { $project: { directQuote: 0 } },

      // Quotation relations: client, department, createdBy
      {
        $lookup: {
          from: "customers",
          localField: "quoteId.client",
          foreignField: "_id",
          as: "quoteClient"
        }
      },
      { $unwind: { path: "$quoteClient", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "departments",
          localField: "quoteId.department",
          foreignField: "_id",
          as: "quoteDepartment"
        }
      },
      { $unwind: { path: "$quoteDepartment", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "employees",
          localField: "quoteId.createdBy",
          foreignField: "_id",
          as: "quoteCreatedBy",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      {
        $unwind: {
          path: "$quoteCreatedBy",
          preserveNullAndEmptyArrays: true
        }
      },

      // CreatedBy (LPO creator)
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

      // Approved / Rejected history employees
      {
        $lookup: {
          from: "employees",
          localField: "approvedHistory.approvedBy",
          foreignField: "_id",
          as: "approvedEmployees",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      {
        $lookup: {
          from: "employees",
          localField: "rejectedHistory.rejectedBy",
          foreignField: "_id",
          as: "rejectedEmployees",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      {
        $addFields: {
          approvedHistory: {
            $map: {
              input: "$approvedHistory",
              as: "history",
              in: {
                $mergeObjects: [
                  "$$history",
                  {
                    approvedBy: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$approvedEmployees",
                            as: "emp",
                            cond: { $eq: ["$$emp._id", "$$history.approvedBy"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          },
          rejectedHistory: {
            $map: {
              input: "$rejectedHistory",
              as: "history",
              in: {
                $mergeObjects: [
                  "$$history",
                  {
                    rejectedBy: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$rejectedEmployees",
                            as: "emp",
                            cond: { $eq: ["$$emp._id", "$$history.rejectedBy"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },

      // Workflow steps: resolve each step's role and the employee who acted on it
      {
        $lookup: {
          from: "categories",
          localField: "approvalStatus.role",
          foreignField: "_id",
          as: "approvalRoles"
        }
      },
      {
        $lookup: {
          from: "employees",
          localField: "approvalStatus.updatedBy",
          foreignField: "_id",
          as: "approvalEmployees",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      {
        $addFields: {
          approvalStatus: {
            $map: {
              input: { $ifNull: ["$approvalStatus", []] },
              as: "approval",
              in: {
                $mergeObjects: [
                  "$$approval",
                  {
                    role: {
                      $arrayElemAt: [
                        { $filter: { input: "$approvalRoles", as: "r", cond: { $eq: ["$$r._id", "$$approval.role"] } } },
                        0
                      ]
                    },
                    updatedBy: {
                      $arrayElemAt: [
                        { $filter: { input: "$approvalEmployees", as: "e", cond: { $eq: ["$$e._id", "$$approval.updatedBy"] } } },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $project: { approvalRoles: 0, approvalEmployees: 0, approvedEmployees: 0, rejectedEmployees: 0 } },

      // Enrich quoteId with related documents and resolve attention contact
      {
        $addFields: {
          quoteId: {
            $cond: [
              { $ifNull: ["$quoteId", false] },
              {
                $mergeObjects: [
                  "$quoteId",
                  {
                    client: "$quoteClient",
                    department: "$quoteDepartment",
                    createdBy: {
                      _id: "$quoteCreatedBy._id",
                      firstName: "$quoteCreatedBy.firstName",
                      lastName: "$quoteCreatedBy.lastName",
                      contactNo: "$quoteCreatedBy.contactNo",
                      email: "$quoteCreatedBy.email"
                    },
                    attention: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$quoteClient.contactDetails",
                            as: "contact",
                            cond: { $eq: ["$$contact._id", "$quoteId.attention"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              },
              null
            ]
          }
        }
      },
      {
        $addFields: {
          itemPartNos: {
            $reduce: {
              input: "$items",
              initialValue: [],
              in: {
                $setUnion: [
                  "$$value",
                  {
                    $cond: [
                      { $and: [{ $ne: ["$$this.partNo", null] }, { $ne: ["$$this.partNo", ""] }] },
                      ["$$this.partNo"],
                      []
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "products",
          let: { partNos: "$itemPartNos" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", { $ifNull: ["$$partNos", []] }]
                }
              }
            },
            {
              $project: {
                partNo: 1,
                productDescription: 1
              }
            }
          ],
          as: "partNumberProducts"
        }
      },
      {
        $addFields: {
          items: {
            $map: {
              input: "$items",
              as: "item",
              in: {
                $mergeObjects: [
                  "$$item",
                  {
                    partNo: {
                      $let: {
                        vars: {
                          product: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$partNumberProducts",
                                  as: "p",
                                  cond: { $eq: ["$$p._id", "$$item.partNo"] }
                                }
                              },
                              0
                            ]
                          }
                        },
                        in: {
                          $cond: [
                            { $ifNull: ["$$product", false] },
                            {
                              _id: "$$product._id",
                              partNo: "$$product.partNo",
                              productDescription: "$$product.productDescription"
                            },
                            "$$item.partNo"
                          ]
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      {
        $unset: ["itemPartNos", "partNumberProducts"]
      }
    ]);

    const purchaseOrder = result[0];

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const grns = await GRN.find({
      purchaseOrderId: objectId,
      isDeleted: { $ne: true }
    });

    if (Array.isArray(purchaseOrder.items)) {
      purchaseOrder.items = purchaseOrder.items.map((poItem: any) => {
        const poPartNoId = poItem.partNo?._id ? poItem.partNo._id.toString() : null;

        let issuedQty = 0;
        for (const grn of grns) {
          if (!Array.isArray(grn.items)) continue;
          for (const grnItem of grn.items) {
            const partNoMatch = poPartNoId && grnItem.partNo && String(grnItem.partNo) === String(poItem.partNo?.partNo);
            const descriptionMatch = poItem.detail && grnItem.itemDescription &&
              poItem.detail.trim().toLowerCase() === grnItem.itemDescription.trim().toLowerCase();
            if (partNoMatch || descriptionMatch) {
              issuedQty += Number(grnItem.acceptedQty) || 0;
            }
          }
        }

        const orderedQty = Number(poItem.quantity) || 0;
        const pendingQty = Math.max(orderedQty - issuedQty, 0);

        return {
          ...poItem,
          issuedQty,
          pendingQty
        };
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
      .populate("jobId");

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
    const { page = 1, row = 10, search = "", status, purchaseId, jobId, receiptStatus, vendorBills, readyToDeliver } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(row);
    const skip = (pageNumber - 1) * pageSize;

    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    const poViewReport = privileges?.purchaseOrder?.viewReport;
    const invoiceViewReport = privileges?.invoice?.viewReport;
    const isVendorBillsView = vendorBills === 'true';
    const canViewVendorBills = isVendorBillsView && invoiceViewReport && invoiceViewReport !== 'none';
    const canWorkWithPurchaseOrders = (poViewReport && poViewReport !== 'none')
      || privileges?.purchaseOrder?.canApprovePOs === true
      || privileges?.purchaseOrder?.canInitiateLPO === true
      || privileges?.purchaseOrder?.canReissueAndRevoke === true
      || canViewVendorBills;
    const accessScope = poViewReport && poViewReport !== 'none'
      ? poViewReport
      : canViewVendorBills
        ? invoiceViewReport
        : null;
    const accessFilter = accessScope
      ? await buildPrivilegeAccessFilter(employee._id, accessScope, 'createdBy')
      : {};

    if (!canWorkWithPurchaseOrders) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: pageNumber,
          pageSize: pageSize,
          totalPages: 0
        }
      });
    }

    const initialMatchStage: any = {};
    const finalMatchStage: any = {};

    if (isVendorBillsView) {
      finalMatchStage.poStatus = { $in: ['Approved', 'Placed', 'Closed'] };
    }

    if (purchaseId) {
      initialMatchStage.purchaseId = new mongoose.Types.ObjectId(purchaseId as string);
    }

    if (jobId) {
      initialMatchStage.jobId = new mongoose.Types.ObjectId(jobId as string);
    }


    const statusFilters = Array.isArray(status)
      ? status.flatMap((value) => String(value).split(','))
      : status
        ? String(status).split(',')
        : [];
    const normalizedStatusFilters = statusFilters.map((value) => value.trim()).filter(Boolean);

    // Vendor bills "Upcoming": placed orders that do not have any active GRN yet.
    if (isVendorBillsView && normalizedStatusFilters.length === 1 && normalizedStatusFilters[0] === 'Placed') {
      finalMatchStage.poStatus = 'Placed';
      finalMatchStage['grns.0'] = { $exists: false };
    }

    if (!isVendorBillsView && normalizedStatusFilters.length > 1) {
      finalMatchStage.poStatus = { $in: normalizedStatusFilters };
    } else if (!isVendorBillsView && normalizedStatusFilters.length === 1) {
      finalMatchStage.poStatus = normalizedStatusFilters[0];
    }

    if (receiptStatus) {
      finalMatchStage.receiptStatus = receiptStatus;
    }

    if (isVendorBillsView && readyToDeliver === 'true') {
      finalMatchStage['deliveryNotes.0'] = { $exists: true };
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
          from: "customers",
          localField: "purchaseId.customerId",
          foreignField: "_id",
          as: "purchaseId.customerId"
        }
      },
      { $unwind: { path: "$purchaseId.customerId", preserveNullAndEmptyArrays: true } },
      ...(Object.keys(accessFilter).length > 0 ? [{
        $match: {
          "purchaseId.createdBy": accessFilter.createdBy
        }
      }] : []),
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
          as: "createdBy",
          pipeline: [{ $project: { password: 0 } }]
        }
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalLpoValue: {
            $sum: "$items.totalCost"
          },
          orderedQuantity: {
            $reduce: {
              input: { $ifNull: ["$items", []] },
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] }
            }
          }
        }
      },
      {
        $lookup: {
          from: "grns",
          let: { purchaseOrderId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$purchaseOrderId", "$$purchaseOrderId"] },
                isDeleted: { $ne: true }
              }
            }
          ],
          as: "grns"
        }
      },
      ...(isVendorBillsView ? [{
        $lookup: {
          from: "deliverynotes",
          let: { jobId: "$jobId._id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$jobId", "$$jobId"] },
                isDeleted: { $ne: true }
              }
            },
            { $sort: { dnDate: -1, createdAt: -1 } },
            { $project: { dnNo: 1, dnDate: 1, status: 1 } }
          ],
          as: "deliveryNotes"
        }
      }] : []),
      {
        $addFields: {
          receivedQuantity: {
            $reduce: {
              input: { $ifNull: ["$grns", []] },
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  {
                    $reduce: {
                      input: { $ifNull: ["$$this.items", []] },
                      initialValue: 0,
                      in: { $add: ["$$value", { $ifNull: ["$$this.receivedQty", 0] }] }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      {
        $addFields: {
          receiptStatus: {
            $switch: {
              branches: [
                { case: { $lte: ["$receivedQuantity", 0] }, then: "Not Received" },
                { case: { $gte: ["$receivedQuantity", "$orderedQuantity"] }, then: "Received" }
              ],
              default: "Partially Received"
            }
          },
          billingStatus: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$supplierInvoices", []] } }, 0] },
              "Invoice Uploaded",
              "Not Billed"
            ]
          }
        }
      },
      // Apply search on populated fields after lookups
      ...(search ? [{
        $match: {
          $or: [
            { "poNo": { $regex: search, $options: "i" } },
            { "subject": { $regex: search, $options: "i" } },
            { "supplierId.supplierName": { $regex: search, $options: "i" } },
            { "jobId.jobId": { $regex: search, $options: "i" } },
            { "purchaseId.customerId.companyName": { $regex: search, $options: "i" } }
          ]
        }
      }] : []),
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
    let purchaseOrders = result[0].data;
    const totalItems = result[0].totalCount[0]?.count || 0;

    purchaseOrders = await Promise.all(purchaseOrders.map(async (po: any) => {
      if (po.approvedHistory && po.approvedHistory.length > 0) {
        po.approvedHistory = await Promise.all(po.approvedHistory.map(async (history: any) => {
          if (history.approvedBy) {
            const employee = await mongoose.model('Employee').findById(history.approvedBy).select('-password');
            history.approvedBy = employee;
          }
          return history;
        }));
      }
      if (po.rejectedHistory && po.rejectedHistory.length > 0) {
        po.rejectedHistory = await Promise.all(po.rejectedHistory.map(async (history: any) => {
          if (history.rejectedBy) {
            const employee = await mongoose.model('Employee').findById(history.rejectedBy).select('-password');
            history.rejectedBy = employee;
          }
          return history;
        }));
      }
      return po;
    }));

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

const seedLpoSequence = (year: string) => async (): Promise<number> => {
  const lastOrder = await PurchaseOrder.findOne(
    { poNo: { $regex: `^NTP-LP-\\d{4}-${year}$` } }
  ).sort({ poNo: -1 });

  if (lastOrder && lastOrder.poNo) {
    const parts = lastOrder.poNo.split("-");
    if (parts.length >= 3 && !isNaN(parseInt(parts[2]))) {
      return parseInt(parts[2]);
    }
  }
  return 0;
};

export const generateLpoNo = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);

    const nextNumber = await getNextSequence(`poNo-${year}`, seedLpoSequence(year));
    const poNo = `NTP-LP-${nextNumber.toString().padStart(4, "0")}-${year}`;

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
    const validStatuses = ["Pending for Approval", "Approved", "Rejected"];
    if (!poStatus || !validStatuses.includes(poStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const setFields: any = { poStatus: poStatus, updatedAt: new Date() };

    // Sending an LPO back for approval starts a fresh workflow route.
    if (poStatus === 'Pending for Approval') {
      const existing = await PurchaseOrder.findById(id);
      if (existing?.createdBy) {
        try {
          const steps = await getWorkflowSteps(PO_WORKFLOW, existing.createdBy.toString(), lpoApprovalContext(existing));
          setFields.approvalStatus = steps;
          if (steps.length === 0) setFields.poStatus = 'Approved';
        } catch (workflowError) {
          console.error('Error initializing LPO workflow steps:', workflowError);
          setFields.approvalStatus = [];
        }
      }
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      { $set: setFields },
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

    if (updatedPurchaseOrder.poStatus === 'Pending for Approval' && updatedPurchaseOrder.approvalStatus?.length) {
      const employee = await getEmployeeData(req.user);
      await notifyLpoApprovers(updatedPurchaseOrder, employee?._id, req.app.get('io') as Server);
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

/** Marks an approved LPO as sent to the supplier (Approved → Placed). Manual only; goods are received against Placed LPOs. */
export const placePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    const employee = await getEmployeeData(req.user);
    if (!employee) {
      return res.status(401).json({ success: false, message: "Employee not found" });
    }
    const expected = new Date(req.body?.expectedDeliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!req.body?.expectedDeliveryDate || isNaN(expected.getTime())) {
      return res.status(400).json({ success: false, message: "Expected delivery date is required" });
    }
    if (expected < today) {
      return res.status(400).json({ success: false, message: "Expected delivery date can't be in the past" });
    }
    const note = String(req.body?.note ?? '').trim();
    let contact: any;
    if (req.body?.contactId) {
      const po = await PurchaseOrder.findById(id).select('supplierId').lean();
      const supplier: any = po ? await Supplier.findById(po.supplierId).select('contacts').lean() : null;
      const found = (supplier?.contacts || []).find((c: any) => String(c._id) === String(req.body.contactId));
      if (!found) {
        return res.status(400).json({ success: false, message: "Selected contact doesn't belong to this supplier" });
      }
      contact = { name: found.name, email: found.email, phoneNumber: found.phoneNumber, designation: found.designation };
    }
    const placed = await PurchaseOrder.findOneAndUpdate(
      { _id: id, poStatus: 'Approved' },
      { $set: { poStatus: 'Placed', placedAt: new Date(), placedBy: employee._id, expectedDeliveryDate: expected, updatedAt: new Date(), ...(contact && { placedContact: contact }), ...(note && { placedNote: note }) } },
      { new: true }
    ).populate('supplierId', 'supplierName');
    if (!placed) {
      const exists = await PurchaseOrder.exists({ _id: id });
      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists ? "Only an approved LPO can be placed" : "Purchase order not found",
      });
    }
    // The receiving team hears now, and again on the expected day.
    const supplierName = (placed.supplierId as any)?.supplierName || 'the supplier';
    const dateText = expected.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const grnFilter = { privilegeKey: 'grn' as any, checkFunction: (p: any) => !!p.grn?.viewReport && p.grn.viewReport !== 'none' };
    const base = { referenceModel: 'PurchaseOrder', sentBy: employee._id, referenceId: placed._id, additionalData: { purchaseOrderId: placed._id.toString() } };
    await notifyByPrivilege({ ...base, type: 'LpoPlaced', title: 'LPO arriving', message: `${placed.poNo} from ${supplierName} is expected on ${dateText}` }, grnFilter);
    // Finance sees the commitment early in Vendor Bills > Upcoming.
    const billFilter = { privilegeKey: 'invoice' as any, checkFunction: (p: any) => !!p.invoice?.viewReport && p.invoice.viewReport !== 'none' };
    await notifyByPrivilege({ ...base, type: 'LpoPlacedBilling', title: 'LPO placed', message: `${placed.poNo} to ${supplierName} was placed, delivery expected ${dateText}` }, billFilter);
    const dueAt = new Date(expected);
    dueAt.setHours(8, 0, 0, 0);
    await notifyByPrivilege({ ...base, type: 'LpoDeliveryDue', title: 'LPO due today', message: `${placed.poNo} from ${supplierName} is due today. Create the GRN when it arrives.`, sendAt: dueAt, dedupeKey: `lpo-due:${placed._id}:${expected.toISOString().slice(0, 10)}` }, grnFilter);
    return res.status(200).json({ success: true, message: "Order placed", data: placed });
  } catch (error: any) {
    console.error("Place purchase order error:", error);
    return res.status(500).json({ success: false, message: "Failed to place the order", error: error.message });
  }
};

const DOCUMENT_STATUSES = ['Approved', 'Placed'];

/** Adds uploaded files to an approved/placed LPO's documents. */
export const addPurchaseOrderDocuments = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    const files: any[] = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "Choose at least one file" });
    }
    const employee = await getEmployeeData(req.user);
    const docs = await Promise.all(files.map(async (file: any) => {
      await uploadFileToAws(file.filename, file.path);
      return { fileName: file.filename, originalname: file.originalname, mimetype: file.mimetype, size: file.size, uploadedBy: employee?._id, uploadedAt: new Date() };
    }));
    const updated = await PurchaseOrder.findOneAndUpdate(
      { _id: id, poStatus: { $in: DOCUMENT_STATUSES } },
      { $push: { documents: { $each: docs } } },
      { new: true }
    );
    if (!updated) {
      const exists = await PurchaseOrder.exists({ _id: id });
      return res.status(exists ? 409 : 404).json({ success: false, message: exists ? "Documents can only be added to an approved or placed LPO" : "Purchase order not found" });
    }
    return res.status(200).json({ success: true, message: "Documents uploaded", data: updated });
  } catch (error: any) {
    console.error("Add purchase order documents error:", error);
    return res.status(500).json({ success: false, message: "Failed to upload documents", error: error.message });
  }
};

export const removePurchaseOrderDocument = async (req: any, res: Response) => {
  try {
    const { id, fileName } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    const updated = await PurchaseOrder.findOneAndUpdate(
      { _id: id, poStatus: { $in: DOCUMENT_STATUSES }, 'documents.fileName': fileName },
      { $pull: { documents: { fileName } } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    await deleteFileFromAws(fileName);
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Remove purchase order document error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete the document", error: error.message });
  }
};

const CANCELLABLE_STATUSES =['Draft', 'Pending for Approval', 'Approved', 'Placed'];
const sameDetail = (a: any, b: any) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Each PO line with what is received on its GRNs and what can still be cancelled. */
const cancellableLines = async (po: any) => {
  const grns: any[] = await GRN.find({ purchaseOrderId: po._id, isDeleted: false }).select('items').lean();
  return (po.items || []).map((item: any, index: number) => {
    const received = grns.reduce((sum, grn) => sum + (grn.items || [])
      .filter((g: any) => sameDetail(g.itemDescription, item.detail))
      .reduce((s: number, g: any) => s + (Number(g.receivedQty) || 0), 0), 0);
    const quantity = Number(item.quantity) || 0;
    return {
      index,
      prLineKey: item.prLineKey,
      detail: item.detail,
      uom: item.uom,
      quantity,
      unitCost: Number(item.unitCost) || 0,
      receivedQty: Math.min(received, quantity),
      cancelledQty: Number(item.cancelledQty) || 0,
      openQty: Math.max(0, quantity - received),
    };
  });
};

/** What a cancel can take off this PO: per line, the quantity not received yet. */
export const getPurchaseOrderCancellable = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    const po: any = await PurchaseOrder.findById(id).lean();
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    return res.status(200).json({
      success: true,
      data: { _id: po._id, poNo: po.poNo, poStatus: po.poStatus, cancellable: CANCELLABLE_STATUSES.includes(po.poStatus), lines: await cancellableLines(po) },
    });
  } catch (error: any) {
    console.error("Get cancellable PO error:", error);
    return res.status(500).json({ success: false, message: "Failed to load the purchase order", error: error.message });
  }
};

/**
 * Cancels a PO, whole or in part. `lines: [{ index, qty }]` takes `qty` off those lines; without `lines`
 * everything not yet received is cancelled. The cancelled quantity goes back to the request, where it can
 * be ordered again from the same supplier or re-awarded to another. A PO left with nothing ordered is Cancelled.
 */
export const cancelPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    if (!reason) return res.status(400).json({ success: false, message: "Say why the PO is being cancelled." });
    const employee = await getEmployeeData(req.user);
    if (!employee) return res.status(401).json({ success: false, message: "Employee not found" });

    const po: any = await PurchaseOrder.findById(id);
    if (!po) return res.status(404).json({ success: false, message: "Purchase order not found" });
    if (!CANCELLABLE_STATUSES.includes(po.poStatus)) {
      return res.status(409).json({ success: false, message: `A ${po.poStatus} PO cannot be cancelled.` });
    }

    const lines = await cancellableLines(po);
    const asked: { index: number; qty: number }[] = Array.isArray(req.body?.lines)
      ? req.body.lines.map((l: any) => ({ index: Number(l?.index), qty: Number(l?.qty) || 0 })).filter((l: any) => l.qty > 0)
      : lines.filter((l: any) => l.openQty > 0).map((l: any) => ({ index: l.index, qty: l.openQty }));
    if (!asked.length) return res.status(400).json({ success: false, message: "Nothing to cancel: every line is already received." });

    const cancelled: { prLineKey?: string; detail: string; qty: number }[] = [];
    for (const { index, qty } of asked) {
      const line = lines[index];
      if (!line) return res.status(400).json({ success: false, message: "That line is not on this PO." });
      if (qty > line.openQty + 0.0001) {
        return res.status(400).json({ success: false, message: `Only ${line.openQty} of "${line.detail}" can be cancelled; the rest is received.` });
      }
      const item = po.items[index];
      item.quantity = Number((line.quantity - qty).toFixed(4));
      item.totalCost = Number((item.quantity * (Number(item.unitCost) || 0)).toFixed(2));
      item.cancelledQty = (Number(item.cancelledQty) || 0) + qty;
      cancelled.push({ prLineKey: item.prLineKey, detail: item.detail, qty });
    }

    po.cancelHistory.push({ cancelledBy: employee._id, reason, date: new Date(), lines: cancelled });
    const ordered = (po.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
    if (ordered <= 0) po.poStatus = 'Cancelled';
    else if (po.poStatus === 'Placed' && lines.every((l: any) => Number(po.items[l.index].quantity) <= l.receivedQty + 0.0001)) po.poStatus = 'Closed';
    po.markModified('items');
    await po.save();

    return res.status(200).json({
      success: true,
      message: po.poStatus === 'Cancelled' ? `${po.poNo} cancelled` : `${po.poNo} partly cancelled`,
      data: po,
    });
  } catch (error: any) {
    console.error("Cancel purchase order error:", error);
    return res.status(500).json({ success: false, message: "Failed to cancel the purchase order", error: error.message });
  }
};

export const approvePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);

    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    if (!/^superadmin$/i.test(employee.category?.role ?? "") && !privileges?.purchaseOrder?.canApprovePOs) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to approve purchase orders",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(id);
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (purchaseOrder.poStatus !== 'Pending for Approval') {
      return res.status(400).json({
        success: false,
        message: "Only LPOs with 'Pending for Approval' status can be approved",
      });
    }

    // The person who raised an LPO never signs it off, except superadmin.
    if (!/^superadmin$/i.test(employee.category?.role ?? "") && purchaseOrder.createdBy?.toString() === employee._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot approve an LPO that you created",
      });
    }

    const approvalEntry = {
      approvedBy: employee._id,
      reason: comment || '',
      date: new Date()
    };

    // The PO Approval workflow advances the LPO one stage at a time. LPOs raised before it existed have no steps: only Super Admin can decide those.
    let nextStatus = 'Approved';
    let nextSteps: any[] | undefined;
    if (purchaseOrder.approvalStatus?.length) {
      try {
        nextSteps = await updateApprovalStatus('approved', purchaseOrder.toObject().approvalStatus, comment || '', employee, lpoApprovalContext(purchaseOrder));
      } catch (workflowError) {
        return res.status(403).json({ success: false, message: plainError(workflowError) });
      }
      if (nextSteps.some((approval: any) => approval.status === 'pending')) nextStatus = 'Pending for Approval';
    } else if (!/^superadmin$/i.test(employee.category?.role ?? '')) {
      return res.status(403).json({ success: false, message: "This LPO has no approval route; only Super Admin can approve it" });
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          poStatus: nextStatus,
          updatedAt: new Date(),
          ...(nextSteps ? { approvalStatus: nextSteps } : {})
        },
        $push: {
          approvedHistory: approvalEntry
        }
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate('approvedHistory.approvedBy', 'firstName lastName');

    const socket = req.app.get('io') as Server;
    if (nextStatus === 'Pending for Approval') {
      if (updatedPurchaseOrder) await notifyLpoApprovers(updatedPurchaseOrder, employee._id, socket);
      return res.status(200).json({
        success: true,
        message: "Approved. The LPO is now with the next approver",
        data: updatedPurchaseOrder,
      });
    }
    await createNotificationWithPrivileges(
      {
        type: 'LpoApproved',
        referenceModel: 'PurchaseOrder',
        title: 'LPO approved',
        message: `LPO ${purchaseOrder.poNo} has been approved. It is ready to create GRN and upload supplier invoice.`,
        sentBy: employee._id?.toString(),
        referenceId: purchaseOrder._id,
        additionalData: { purchaseId: purchaseOrder.purchaseId?.toString() }
      },
      {
        privilegeKey: 'purchaseOrder',
        checkFunction: (p, employeeId) => employeeId === purchaseOrder.createdBy?.toString() && (p.purchaseOrder?.viewReport !== 'none' || p.purchaseOrder?.canInitiateLPO === true)
      },
      socket
    );

    return res.status(200).json({
      success: true,
      message: "Purchase order approved successfully",
      data: updatedPurchaseOrder,
    });
  } catch (error: any) {
    console.error("Approve purchase order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve purchase order",
      error: error.message,
    });
  }
};

export const rejectPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);

    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    if (!/^superadmin$/i.test(employee.category?.role ?? "") && !privileges?.purchaseOrder?.canApprovePOs) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to reject purchase orders",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(id);
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    if (purchaseOrder.poStatus !== 'Pending for Approval') {
      return res.status(400).json({
        success: false,
        message: "Only LPOs with 'Pending for Approval' status can be rejected",
      });
    }

    // The person who raised an LPO never signs it off, except superadmin.
    if (!/^superadmin$/i.test(employee.category?.role ?? "") && purchaseOrder.createdBy?.toString() === employee._id?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot reject an LPO that you created",
      });
    }

    const rejectionEntry = {
      rejectedBy: employee._id,
      reason: comment || '',
      date: new Date()
    };

    let rejectedSteps: any[] | undefined;
    if (purchaseOrder.approvalStatus?.length) {
      try {
        rejectedSteps = await updateApprovalStatus('rejected', purchaseOrder.toObject().approvalStatus, comment || '', employee, lpoApprovalContext(purchaseOrder));
      } catch (workflowError) {
        return res.status(403).json({ success: false, message: plainError(workflowError) });
      }
    } else if (!/^superadmin$/i.test(employee.category?.role ?? '')) {
      return res.status(403).json({ success: false, message: "This LPO has no approval route; only Super Admin can reject it" });
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          poStatus: 'Rejected',
          updatedAt: new Date(),
          ...(rejectedSteps ? { approvalStatus: rejectedSteps } : {})
        },
        $push: {
          rejectedHistory: rejectionEntry
        }
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate('rejectedHistory.rejectedBy', 'firstName lastName');

    // No issuedQuantity bookkeeping needed: 'Rejected' POs are already
    // excluded from the derived-sum queries in getSuppliersForPurchaseRequest
    // / getItemsForPurchaseRequest, so this PO stops counting automatically.

    const socket = req.app.get('io') as Server;
    await createNotificationWithPrivileges(
      {
        type: 'LpoRejected',
        referenceModel: 'PurchaseOrder',
        title: 'LPO rejected',
        message: `LPO ${purchaseOrder.poNo} has been rejected.`,
        sentBy: employee._id?.toString(),
        referenceId: purchaseOrder._id,
        additionalData: { purchaseId: purchaseOrder.purchaseId?.toString() }
      },
      {
        privilegeKey: 'purchaseOrder',
        checkFunction: (p, employeeId) => employeeId === purchaseOrder.createdBy?.toString() && (p.purchaseOrder?.viewReport !== 'none' || p.purchaseOrder?.canInitiateLPO === true)
      },
      socket
    );

    return res.status(200).json({
      success: true,
      message: "Purchase order rejected successfully",
      data: updatedPurchaseOrder,
    });
  } catch (error: any) {
    console.error("Reject purchase order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject purchase order",
      error: error.message,
    });
  }
};

export const updateSupplierInvoices = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const supplierFiles = req.files;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    let supplierInvoices = [];
    
    // Upload new files to AWS
    if (supplierFiles && supplierFiles.length > 0) {
      supplierInvoices = await Promise.all(supplierFiles.map(async (file: any) => {
        await uploadFileToAws(file.filename, file.path);
        return { fileName: file.filename, originalname: file.originalname };
      }));
    }

    // Merge with existing files if provided
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
    ).populate('purchaseId', 'jobId');

    if (!updatedPurchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const jobId = (updatedPurchaseOrder as any).jobId?._id || (updatedPurchaseOrder as any).jobId || 
                  (updatedPurchaseOrder as any).purchaseId?.jobId?._id || (updatedPurchaseOrder as any).purchaseId?.jobId;
    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      await checkAndUpdateJobCompletionStatus(jobId.toString());
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

export const getSuppliersForPurchaseRequest = async (req: Request, res: Response) => {
  try {
    const { purchaseId } = req.params;
    const { excludeLpoId } = req.query; // Optional: exclude a specific LPO's own reservation (for reissue)

    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Request ID",
      });
    }

    const purchaseRequestDoc = await purchaseRequest.findById(purchaseId);
    if (!purchaseRequestDoc) {
      return res.status(404).json({
        success: false,
        message: "Purchase request not found",
      });
    }

    // Key items by partNo (stable item reference) rather than the free-text
    // `detail` field, which can differ slightly between the purchase request
    // and issued POs and cause required/issued quantities to fail to match up.
    const itemKey = (entry: any) => (entry.partNo ? entry.partNo.toString() : entry.detail);

    const supplierMap = new Map();

    purchaseRequestDoc.items.forEach((item: any) => {
      if (item.itemDetails && Array.isArray(item.itemDetails)) {
        item.itemDetails.forEach((itemDetail: any) => {
          {
            // A line split between suppliers has one selected comparison per supplier.
            lineSuppliers(itemDetail).forEach((selectedComparison) => {
              const supplierId = selectedComparison.supplierId.toString();

              if (!supplierMap.has(supplierId)) {
                supplierMap.set(supplierId, { supplierId: selectedComparison.supplierId, itemDetails: [] });
              }

              supplierMap.get(supplierId).itemDetails.push({
                key: itemKey(itemDetail),
                quantity: selectedComparison.quantity,
                unitPrice: selectedComparison.unitPrice
              });
            });
          }
        });
      }
    });

    const supplierIds = Array.from(supplierMap.keys()).map(id => new mongoose.Types.ObjectId(id));

    // Always derive issued quantities live from the actual PurchaseOrder
    // documents (never from a stored counter) so this can never drift out of
    // sync, no matter how many times a PO for this item is created,
    // rejected, resubmitted, revoked, or reissued.
    // Pending-for-Approval POs reserve quantity too - included alongside confirmed
    // issues so a supplier isn't offered as selectable while its items are locked
    // in an LPO still awaiting an approval decision. excludeLpoId leaves out the
    // LPO's own (still-pending) reservation while it's being reissued, so its
    // supplier doesn't appear locked against itself.
    const suppliersQuery: any = {
      purchaseId: new mongoose.Types.ObjectId(purchaseId),
      supplierId: { $in: supplierIds },
      poStatus: { $nin: ['Draft', 'Rejected'] }
    };
    if (excludeLpoId && mongoose.Types.ObjectId.isValid(excludeLpoId as string)) {
      suppliersQuery._id = { $ne: new mongoose.Types.ObjectId(excludeLpoId as string) };
    }
    const existingPurchaseOrders = await PurchaseOrder.find(suppliersQuery);

    const issuedItemsMap = new Map();
    existingPurchaseOrders.forEach((po: any) => {
      const supplierId = po.supplierId.toString();
      if (!issuedItemsMap.has(supplierId)) {
        issuedItemsMap.set(supplierId, []);
      }
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach((item: any) => {
          issuedItemsMap.get(supplierId).push({
            key: itemKey(item),
            quantity: item.quantity
          });
        });
      }
    });

    const suppliers = await Supplier.find({
      _id: { $in: supplierIds }
    });

    const result = suppliers.map((supplier: any) => {
      const supplierId = supplier._id.toString();
      const supplierItemDetails = supplierMap.get(supplierId)?.itemDetails || [];
      const issuedItems = issuedItemsMap.get(supplierId) || [];

      const requiredItemsMap = new Map();
      supplierItemDetails.forEach((itemDetail: any) => {
        const currentRequired = requiredItemsMap.get(itemDetail.key) || 0;
        requiredItemsMap.set(itemDetail.key, currentRequired + (itemDetail.quantity || 0));
      });

      const issuedItemsCountMap = new Map();
      issuedItems.forEach((item: any) => {
        const currentIssued = issuedItemsCountMap.get(item.key) || 0;
        issuedItemsCountMap.set(item.key, currentIssued + (item.quantity || 0));
      });

      let allQuantitiesIssued = true;
      for (const [key, requiredQty] of requiredItemsMap.entries()) {
        const issuedQty = issuedItemsCountMap.get(key) || 0;
        if (issuedQty < requiredQty) {
          allQuantitiesIssued = false;
          break;
        }
      }

      return {
        ...supplier.toObject(),
        isFullyIssued: allQuantitiesIssued,
        canSelect: !allQuantitiesIssued
      };
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Get suppliers for purchase request error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch suppliers",
      error: error.message,
    });
  }
};

export const revokePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const tokenData = req.user;
    const employee = await getEmployeeData(tokenData);
    if (!employee) {
      return res.status(401).json({
        success: false,
        message: "Employee not found",
      });
    }

    const privileges = employee.category?.privileges;
    if (!privileges?.purchaseOrder?.canReissueAndRevoke) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to revoke purchase orders",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Order ID",
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(id);
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    // Hard delete the purchase order. No issuedQuantity bookkeeping needed:
    // deleted POs can no longer appear in the derived-sum queries in
    // getSuppliersForPurchaseRequest / getItemsForPurchaseRequest, so this
    // PO stops counting automatically.
    await PurchaseOrder.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Purchase order revoked successfully",
    });
  } catch (error: any) {
    console.error("Revoke PurchaseOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke purchase order",
      error: error.message,
    });
  }
};

export const getItemsForPurchaseRequest = async (req: Request, res: Response) => {
  try {
    const { purchaseId, supplierId } = req.params;
    const { excludeLpoId } = req.query; // Optional parameter to exclude a specific LPO (for reissue)

    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Purchase Request ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Supplier ID",
      });
    }

    const purchaseRequestDoc = await purchaseRequest.findById(purchaseId);
    if (!purchaseRequestDoc) {
      return res.status(404).json({
        success: false,
        message: "Purchase request not found",
      });
    }

    // Build query to exclude drafts and optionally exclude a specific LPO (for reissue)
    const query: any = {
      purchaseId: new mongoose.Types.ObjectId(purchaseId),
      supplierId: new mongoose.Types.ObjectId(supplierId),
      poStatus: { $nin: ['Draft', 'Pending for Approval', 'Rejected'] }
    };

    // Pending-for-Approval POs reserve quantity too - they just aren't confirmed yet.
    // Tracked separately from `query` so the frontend can show how much is locked in
    // pending approval versus already issued.
    const pendingQuery: any = {
      purchaseId: new mongoose.Types.ObjectId(purchaseId),
      supplierId: new mongoose.Types.ObjectId(supplierId),
      poStatus: 'Pending for Approval'
    };

    // If excludeLpoId is provided, exclude that LPO from calculations (for reissue)
    if (excludeLpoId && mongoose.Types.ObjectId.isValid(excludeLpoId as string)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeLpoId as string) };
      pendingQuery._id = { $ne: new mongoose.Types.ObjectId(excludeLpoId as string) };
    }

    // excludeLpoId already removes the reissued PO from `query` above, so the
    // POs found here are exactly the ones that should count as "issued" -
    // no separate stored counter or subtraction step needed.
    const [existingPurchaseOrders, pendingPurchaseOrders] = await Promise.all([
      PurchaseOrder.find(query),
      PurchaseOrder.find(pendingQuery)
    ]);

    const itemKey = (entry: any) => (entry.partNo ? entry.partNo.toString() : entry.detail);

    const issuedItemsMap = new Map();
    existingPurchaseOrders.forEach((po: any) => {
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach((item: any) => {
          const key = itemKey(item);
          const currentIssued = issuedItemsMap.get(key) || 0;
          issuedItemsMap.set(key, currentIssued + (item.quantity || 0));
        });
      }
    });

    const pendingItemsMap = new Map();
    pendingPurchaseOrders.forEach((po: any) => {
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach((item: any) => {
          const key = itemKey(item);
          const currentPending = pendingItemsMap.get(key) || 0;
          pendingItemsMap.set(key, currentPending + (item.quantity || 0));
        });
      }
    });

    const items: any[] = [];
    purchaseRequestDoc.items.forEach((item: any) => {
      if (item.itemDetails && Array.isArray(item.itemDetails)) {
        item.itemDetails.forEach((itemDetail: any) => {
          {
            const chosen = lineSuppliers(itemDetail).find((entry) => String(entry.supplierId) === supplierId);
            if (chosen) {
              const selectedComparison = chosen.comparison;
              const totalQuantity = chosen.quantity;
              const totalIssued = issuedItemsMap.get(itemKey(itemDetail)) || 0;
              const pendingQuantity = pendingItemsMap.get(itemKey(itemDetail)) || 0;
              const remainingQuantity = Math.max(0, totalQuantity - totalIssued - pendingQuantity);
              const isFullyIssued = remainingQuantity <= 0;

              items.push({
                _id: itemDetail._id ? itemDetail._id.toString() : `${itemDetail.detail}-${selectedComparison.quantity}`,
                itemName: item.itemName,
                detail: itemDetail.detail,
                partNo: itemDetail.partNo,
                originalQuantity: totalQuantity,
                remainingQuantity: remainingQuantity,
                issuedQuantity: totalIssued,
                pendingQuantity: pendingQuantity,
                quantity: remainingQuantity,
                unitPrice: chosen.unitPrice,
                comparisons: selectedComparison,
                isIssued: isFullyIssued
              });
            }
          }
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: items,
    });
  } catch (error: any) {
    console.error("Get items for purchase request error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
      error: error.message,
    });
  }
};

/**
 * The RFQ a PO's supplier price traces back to: the procurement RFQ of its PR when there is one,
 * otherwise the sales RFQ that seeded the quotation. Lets reports compare quoted vs final cost.
 */
const resolvePoRfqId = async (purchaseId: any, quoteId: any, supplierId?: any) => {
  try {
    if (purchaseId && mongoose.Types.ObjectId.isValid(purchaseId)) {
      // A request can have one RFQ per supplier; the PO traces back to its own supplier's.
      const live = { purchaseRequestId: purchaseId, rfqType: { $ne: RfqType.Sales }, isDeleted: false, status: { $ne: 'Cancelled' } };
      const procurement = (supplierId && mongoose.Types.ObjectId.isValid(supplierId)
        ? await Rfq.findOne({ ...live, 'suppliers.supplierId': supplierId }, { _id: 1 }).lean()
        : null) || await Rfq.findOne(live, { _id: 1 }).lean();
      if (procurement) return procurement._id;
    }
    if (quoteId && mongoose.Types.ObjectId.isValid(quoteId)) {
      const quote: any = await Quotation.findById(quoteId, { sourceRfqId: 1 }).lean();
      if (quote?.sourceRfqId) return quote.sourceRfqId;
    }
  } catch (error) {
    console.error('Failed to resolve RFQ for PO:', error);
  }
  return undefined;
};


/** Super Admin gives a pending LPO a fresh approval route. Unticked stages are skipped for this LPO only. */
export const resetPurchaseOrderWorkflow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = await getEmployeeData(req.user);
    if (!/^superadmin$/i.test((me?.category as any)?.role || "")) {
      return res.status(403).json({ success: false, message: "Only a Super Admin can reset the PO approval workflow" });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid Purchase Order ID" });
    }
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, message: "Purchase order not found" });
    }
    if (purchaseOrder.poStatus !== "Pending for Approval") {
      return res.status(400).json({ success: false, message: `Only a pending LPO can be reset (this one is ${purchaseOrder.poStatus})` });
    }
    const chosen: string[] | null = Array.isArray(req.body.stepRoleIds) ? req.body.stepRoleIds.map(String) : null;
    const route = await rebuildPendingRoute(PO_WORKFLOW, String(purchaseOrder.createdBy), lpoApprovalContext(purchaseOrder), (purchaseOrder.toObject() as any).approvalStatus, chosen);
    await PurchaseOrder.updateOne({ _id: purchaseOrder._id }, { $set: { approvalStatus: route, updatedAt: new Date() } });
    return res.status(200).json({ success: true, message: "PO approval workflow reset" });
  } catch (error) {
    next(error);
  }
};
