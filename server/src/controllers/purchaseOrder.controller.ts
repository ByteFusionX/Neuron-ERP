import { Request, Response } from "express";
import PurchaseOrder from "../models/purchaseOrder.model"; 
import purchaseRequest from "../models/purchaseRequest.model"
import Supplier from "../models/supplier.model";
import Quotation from "../models/quotation.model";
import jobModel from "../models/job.model";
import mongoose from "mongoose";
import { getEmployeeData, updateIssuedQuantities, buildPrivilegeAccessFilter } from "../common/utils/util";
import { uploadFileToAws } from "../common/aws-connect";
import { checkAndUpdateJobCompletionStatus } from "./job.controller";

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
      etaTerms: etaTerms || '',
      paymentTerms: paymentTerms || '',
      shippingTerms: shippingTerms || '',
      deliveryTerms: deliveryTerms || '',
      placeOfDelivery: placeOfDelivery || '',
      subject: subject || '',
      poDate: poDate ? new Date(poDate) : new Date(),
      termsAndCondition: termsAndCondition || '',
      discount: discount || 0,
      poStatus: poStatus === 'Draft' ? 'Draft' : 'Pending for Approval',
      createdBy: employee._id,
    };

    if (currency) {
      purchaseOrderData.currency = currency;
    }

    const purchaseOrder = new PurchaseOrder(purchaseOrderData);
    await purchaseOrder.save();

    if (purchaseOrderData.poStatus !== 'Draft') {
      const purchaseRequestDoc = await purchaseRequest.findById(purchaseId);
      if (purchaseRequestDoc) {
        await updateIssuedQuantities(
          purchaseRequestDoc,
          supplierId,
          items.map((item: any) => ({ detail: item.detail, quantity: item.quantity })),
          'add'
        );
      }
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
    const { id } = req.params;
    const { poStatus, items, supplierId } = req.body;

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

    const updateData: any = {
      ...req.body,
      updatedAt: new Date()
    };

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

    const updatedOrder = await PurchaseOrder.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found",
      });
    }

    const oldStatus = existingOrder.poStatus;
    const newStatus = poStatus || updateData.poStatus;

    if (oldStatus === 'Draft' && newStatus === 'Pending for Approval' && items && supplierId) {
      const purchaseRequestDoc = await purchaseRequest.findById(updatedOrder.purchaseId);
      if (purchaseRequestDoc) {
        await updateIssuedQuantities(
          purchaseRequestDoc,
          supplierId,
          items.map((item: any) => ({ detail: item.detail, quantity: item.quantity })),
          'add'
        );
      }
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

export const reissuePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { items, supplierId, originalItems, ...updateData } = req.body;

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

    // Handle issuedQuantity adjustment for reissue
    if (originalItems && items && supplierId) {
      const purchaseRequestDoc = await purchaseRequest.findById(updatedOrder.purchaseId);
      if (purchaseRequestDoc) {
        // Step 1: Subtract original quantities
        await updateIssuedQuantities(
          purchaseRequestDoc,
          supplierId.toString(),
          originalItems.map((item: any) => ({ detail: item.detail, quantity: item.quantity })),
          'subtract'
        );

        // Step 2: Add new quantities (reload the document to get updated values)
        const updatedPurchaseRequestDoc = await purchaseRequest.findById(updatedOrder.purchaseId);
        if (updatedPurchaseRequestDoc) {
          await updateIssuedQuantities(
            updatedPurchaseRequestDoc,
            supplierId.toString(),
            items.map((item: any) => ({ detail: item.detail, quantity: item.quantity })),
            'add'
          );
        }
      }
    }

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
      {
        $addFields: {
          quoteId: {
            $cond: [
              { $ifNull: ["$quoteId", false] },
              "$quoteId",
              "$jobQuote"
            ]
          }
        }
      },

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
          as: "quoteCreatedBy"
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
          as: "createdBy"
        }
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },

      // Approved / Rejected history employees
      {
        $lookup: {
          from: "employees",
          localField: "approvedHistory.approvedBy",
          foreignField: "_id",
          as: "approvedEmployees"
        }
      },
      {
        $lookup: {
          from: "employees",
          localField: "rejectedHistory.rejectedBy",
          foreignField: "_id",
          as: "rejectedEmployees"
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
    const { page = 1, row = 10, search = "", status, purchaseId } = req.query;
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
    const accessFilter = privileges?.purchase?.viewReport 
      ? await buildPrivilegeAccessFilter(employee._id, privileges.purchase.viewReport, 'createdBy')
      : {};

    const initialMatchStage: any = {};
    const finalMatchStage: any = {};

    if (purchaseId) {
      initialMatchStage.purchaseId = new mongoose.Types.ObjectId(purchaseId as string);
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
            const employee = await mongoose.model('Employee').findById(history.approvedBy);
            history.approvedBy = employee;
          }
          return history;
        }));
      }
      if (po.rejectedHistory && po.rejectedHistory.length > 0) {
        po.rejectedHistory = await Promise.all(po.rejectedHistory.map(async (history: any) => {
          if (history.rejectedBy) {
            const employee = await mongoose.model('Employee').findById(history.rejectedBy);
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
    const validStatuses = ["Draft", "Pending for Approval", "Approved"];
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
    if (!privileges?.purchaseOrder?.canApprovePOs) {
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

    const approvalEntry = {
      approvedBy: employee._id,
      reason: comment || '',
      date: new Date()
    };

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          poStatus: 'Approved',
          updatedAt: new Date()
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
    if (!privileges?.purchaseOrder?.canApprovePOs) {
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

    const rejectionEntry = {
      rejectedBy: employee._id,
      reason: comment || '',
      date: new Date()
    };

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id,
      {
        $set: {
          poStatus: 'Draft',
          updatedAt: new Date()
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

    const supplierMap = new Map();
    const supplierItemCountMap = new Map();

    purchaseRequestDoc.items.forEach((item: any) => {
      if (item.itemDetails && Array.isArray(item.itemDetails)) {
        item.itemDetails.forEach((itemDetail: any) => {
          if (itemDetail.comparisons && Array.isArray(itemDetail.comparisons)) {
            const selectedComparison = itemDetail.comparisons.find((comp: any) => comp.selected === true);
            if (selectedComparison && selectedComparison.supplierId) {
              const supplierId = selectedComparison.supplierId.toString();
              
              if (!supplierMap.has(supplierId)) {
                supplierMap.set(supplierId, {
                  supplierId: selectedComparison.supplierId,
                  itemDetails: []
                });
                supplierItemCountMap.set(supplierId, 0);
              }
              
              supplierMap.get(supplierId).itemDetails.push({
                detail: itemDetail.detail,
                quantity: selectedComparison.quantity,
                unitPrice: selectedComparison.unitPrice
              });
              supplierItemCountMap.set(supplierId, supplierItemCountMap.get(supplierId) + 1);
            }
          }
        });
      }
    });

    const supplierIds = Array.from(supplierMap.keys()).map(id => new mongoose.Types.ObjectId(id));
    
    const existingPurchaseOrders = await PurchaseOrder.find({
      purchaseId: new mongoose.Types.ObjectId(purchaseId),
      supplierId: { $in: supplierIds },
      poStatus: { $nin: ['Draft', 'Pending for Approval'] } // Exclude drafts and pending from issued quantity calculations
    });

    const issuedItemsMap = new Map();
    existingPurchaseOrders.forEach((po: any) => {
      const supplierId = po.supplierId.toString();
      if (!issuedItemsMap.has(supplierId)) {
        issuedItemsMap.set(supplierId, []);
      }
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach((item: any) => {
          issuedItemsMap.get(supplierId).push({
            detail: item.detail,
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
        const key = itemDetail.detail;
        const currentRequired = requiredItemsMap.get(key) || 0;
        requiredItemsMap.set(key, currentRequired + (itemDetail.quantity || 0));
      });

      const issuedItemsCountMap = new Map();
      issuedItems.forEach((item: any) => {
        const key = item.detail;
        const currentIssued = issuedItemsCountMap.get(key) || 0;
        issuedItemsCountMap.set(key, currentIssued + (item.quantity || 0));
      });

      purchaseRequestDoc.items.forEach((item: any) => {
        if (item.itemDetails && Array.isArray(item.itemDetails)) {
          item.itemDetails.forEach((itemDetail: any) => {
            if (itemDetail.comparisons && Array.isArray(itemDetail.comparisons)) {
              const selectedComparison = itemDetail.comparisons.find((comp: any) => comp.selected === true);
              if (selectedComparison && selectedComparison.supplierId && 
                  selectedComparison.supplierId.toString() === supplierId) {
                const key = itemDetail.detail;
                const issuedQty = itemDetail.issuedQuantity || 0;
                if (issuedQty > 0) {
                  const currentIssued = issuedItemsCountMap.get(key) || 0;
                  issuedItemsCountMap.set(key, currentIssued + issuedQty);
                }
              }
            }
          });
        }
      });

      let allQuantitiesIssued = true;
      for (const [detail, requiredQty] of requiredItemsMap.entries()) {
        const issuedQty = issuedItemsCountMap.get(detail) || 0;
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

    const purchaseId = purchaseOrder.purchaseId;
    const supplierId = purchaseOrder.supplierId;
    const items = purchaseOrder.items || [];

    // Hard delete the purchase order
    await PurchaseOrder.findByIdAndDelete(id);

    if (purchaseOrder.poStatus !== 'Draft') {
      const purchaseRequestDoc = await purchaseRequest.findById(purchaseId);
      if (purchaseRequestDoc && items.length > 0) {
        await updateIssuedQuantities(
          purchaseRequestDoc,
          supplierId,
          items.map((item: any) => ({ detail: item.detail, quantity: item.quantity })),
          'subtract'
        );
      }
    }

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
      poStatus: { $nin: ['Draft', 'Pending for Approval'] } // Exclude drafts and pending from issued quantity calculations
    };
    
    // If excludeLpoId is provided, exclude that LPO from calculations (for reissue)
    if (excludeLpoId && mongoose.Types.ObjectId.isValid(excludeLpoId as string)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeLpoId as string) };
    }

    const existingPurchaseOrders = await PurchaseOrder.find(query);

    const issuedItemsMap = new Map();
    existingPurchaseOrders.forEach((po: any) => {
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach((item: any) => {
          const key = item.detail;
          const currentIssued = issuedItemsMap.get(key) || 0;
          issuedItemsMap.set(key, currentIssued + (item.quantity || 0));
        });
      }
    });

    // If excludeLpoId is provided (for reissue), get the excluded LPO and subtract its quantities
    const excludedLpoItemsMap = new Map<string, number>();
    if (excludeLpoId && mongoose.Types.ObjectId.isValid(excludeLpoId as string)) {
      const excludedLpo = await PurchaseOrder.findById(excludeLpoId);
      if (excludedLpo && excludedLpo.items && Array.isArray(excludedLpo.items)) {
        excludedLpo.items.forEach((item: any) => {
          const key = item.detail;
          const currentQty = excludedLpoItemsMap.get(key) || 0;
          excludedLpoItemsMap.set(key, currentQty + (item.quantity || 0));
        });
      }
    }

    const items: any[] = [];
    purchaseRequestDoc.items.forEach((item: any) => {
      if (item.itemDetails && Array.isArray(item.itemDetails)) {
        item.itemDetails.forEach((itemDetail: any) => {
          if (itemDetail.comparisons && Array.isArray(itemDetail.comparisons)) {
            const selectedComparison = itemDetail.comparisons.find((comp: any) => comp.selected === true);
            if (selectedComparison && selectedComparison.supplierId && 
                selectedComparison.supplierId.toString() === supplierId) {
              const totalQuantity = selectedComparison.quantity || itemDetail.quantity || 0;
              const key = itemDetail.detail;
              const issuedFromPOs = issuedItemsMap.get(key) || 0;
              const issuedFromDetail = itemDetail.issuedQuantity || 0;
              
              // If excludeLpoId is provided (for reissue), subtract the excluded LPO quantities
              const excludedQty = excludedLpoItemsMap.get(key) || 0;
              const adjustedIssuedFromDetail = Math.max(0, issuedFromDetail - excludedQty);
              
              // Use adjusted issuedFromDetail as primary source, fall back to issuedFromPOs
              const totalIssued = adjustedIssuedFromDetail > 0 ? adjustedIssuedFromDetail : issuedFromPOs;
              const remainingQuantity = Math.max(0, totalQuantity - totalIssued);
              const isFullyIssued = remainingQuantity <= 0;

              items.push({
                _id: itemDetail._id ? itemDetail._id.toString() : `${itemDetail.detail}-${selectedComparison.quantity}`,
                itemName: item.itemName,
                detail: itemDetail.detail,
                partNo: itemDetail.partNo,
                originalQuantity: totalQuantity,
                remainingQuantity: remainingQuantity,
                issuedQuantity: totalIssued, // This is the adjusted issued quantity (excluding the reissued LPO)
                quantity: remainingQuantity,
                unitPrice: selectedComparison.unitPrice,
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