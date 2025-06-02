import { NextFunction, Request, Response } from "express";
import { PurchaseRequestStatus } from "../models/purchaseRequest.model";
import PurchaseRequest from '../models/purchaseRequest.model'
import jobModel from "../models/job.model";
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Create a new Purchase Request
export const createPurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            jobId,
            purchaseNo,
            dealSheetId,
            status,
        } = req.body;

        if (!jobId || !purchaseNo || !dealSheetId || !status) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                status: 400
            });
        }

        const newPurchaseRequest = new PurchaseRequest(req.body);
        const savedPurchaseRequest = await newPurchaseRequest.save();
        await jobModel.updateOne({ _id: jobId }, { $set: { status: 'Purchase Requested' } })

        return res.status(201).json({
            success: true,
            data: savedPurchaseRequest,
        });
    } catch (error) {
        next(error);
    }
};

export const getPurchaseRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { page, row, status, fromDate, toDate, search } = req.body;
        const pageNumber = Number(page) || 1;
        const pageSize = Number(row) || 10;

        const matchStage: any = {
            isDeleted: false
        };

        if (status) {
            matchStage.status = status;
        }

        if (fromDate && toDate) {
            matchStage.createdAt = {
                $gte: new Date(fromDate),
                $lte: new Date(toDate)
            };
        }

        if (search) {
            matchStage.$or = [
                { purchaseNo: { $regex: search, $options: 'i' } },
                // Add other searchable fields if needed
            ];
        }

        const purchases = await PurchaseRequest.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE" // This removes the mrRequest field entirely
                        ]
                    }
                }
            },
            {
                $project: {
                    mrEngineer: 0,
                    hasMr: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: (pageNumber - 1) * pageSize },
                        { $limit: pageSize }
                    ]
                }
            },
            {
                $project: {
                    data: 1,
                    total: { $arrayElemAt: ['$metadata.total', 0] }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            purchase: purchases[0],
            status: 200
        });
    } catch (error) {
        next(error)
    }
}

// Get list of PRs by status
export const getPurchaseRequestsByStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.params;

        // Validate status
        if (!Object.values(PurchaseRequestStatus).includes(status as PurchaseRequestStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
                status: 400
            });
        }

        const purchaseRequests = await PurchaseRequest.aggregate([
            {
                $match: { status: status }
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $project: {
                    mrEngineer: 0,
                    hasMr: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            { $sort: { createdAt: -1 } }
        ]);

        return res.status(200).json({
            success: true,
            data: purchaseRequests,
        });
    } catch (error) {
        next(error);
    }
};

// Get PR details by ID
export const getPurchaseRequestById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const purchaseRequest = await PurchaseRequest.aggregate([
            {
                $match: {
                    _id: new ObjectId(id)
                }
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerId',
                    foreignField: '_id',
                    as: 'customerId'
                }
            },
            { $unwind: { path: '$customerId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'jobs',
                    localField: 'jobId',
                    foreignField: '_id',
                    as: 'jobId'
                }
            },
            { $unwind: { path: '$jobId', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    hasMr: { $cond: [{ $ifNull: ["$mrRequest.engineer", false] }, true, false] }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: 'mrRequest.engineer',
                    foreignField: '_id',
                    as: 'mrEngineer'
                }
            },
            {
                $addFields: {
                    mrRequest: {
                        $cond: [
                            "$hasMr",
                            {
                                engineer: { $arrayElemAt: ["$mrEngineer", 0] },
                                message: "$mrRequest.message",
                                createdDate: "$mrRequest.createdDate"
                            },
                            "$$REMOVE"
                        ]
                    }
                }
            },
            {
                $project: {
                    mrEngineer: 0,
                    hasMr: 0
                }
            },
            { $unwind: { path: '$mrEngineer', preserveNullAndEmptyArrays: true } },
            { $sort: { createdAt: -1 } }
        ]);

        if (!purchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Purchase request fetched successfully",
            data: purchaseRequest[0],
        });
    } catch (error) {
        next(error);
    }
};

// Generate a new purchase number
export const generatePurchaseNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        const latestPR = await PurchaseRequest.findOne({
            purchaseNo: { $regex: `^PR-${year}${month}-` }
        })
            .sort({ purchaseNo: -1 })
            .limit(1);

        let nextNumber = 1;
        if (latestPR) {
            const parts = latestPR.purchaseNo.split('-');
            if (parts.length === 3) {
                nextNumber = parseInt(parts[2]) + 1;
            }
        }

        const newPurchaseNumber = `NRN/PR-${year}-${month}-${nextNumber.toString().padStart(4, '0')}`;
        return res.status(200).json({
            success: true,
            message: "Purchase number generated successfully",
            data: { purchaseNo: newPurchaseNumber }
        });
    } catch (error) {
        next(error);
    }
};

// Change status of a PR
export const updatePurchaseRequestStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { status, rejectedReason } = req.body;

        // Validate status
        if (!Object.values(PurchaseRequestStatus).includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
                status: 400
            });
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest || purchaseRequest.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        // // If status is changing to Rejected, require rejected reason
        // if (status === PurchaseRequestStatus.Rejected) {
        //     if (!rejectedReason || !rejectedReason.comment) {
        //         return res.status(400).json({
        //             success: false,
        //             message: "Rejection reason is required",
        //             status: 400
        //         });
        //     }

        //     // Add rejected reason to the array
        //     purchaseRequest.rejectedReason.push({
        //         rejectedBy: req.user?._id || rejectedReason.rejectedBy,
        //         comment: rejectedReason.comment,
        //         rejectedAt: new Date()
        //     });
        // }

        // // Update status and other fields
        // purchaseRequest.status = status;
        // purchaseRequest.updatedBy = req.user?._id;
        // purchaseRequest.updatedAt = new Date();

        // const updatedPurchaseRequest = await purchaseRequest.save();

        // return res.status(200).json({
        //     success: true,
        //     message: "Purchase request status updated successfully",
        //     data: updatedPurchaseRequest,
        //     status: 200
        // });
    } catch (error) {
        next(error);
    }
};

// // Edit a PR
// export const updatePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;
//         const updateData = req.body;

//         // Remove fields that shouldn't be directly updated
//         delete updateData._id;
//         delete updateData.purchaseNo;
//         delete updateData.createdAt;
//         delete updateData.createdBy;
//         delete updateData.isDeleted;

//         // Add updated metadata
//         updateData.updatedBy = req.user?._id;
//         updateData.updatedAt = new Date();

//         const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             { $set: updateData },
//             { new: true, runValidators: true }
//         );

//         if (!updatedPurchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Purchase request updated successfully",
//             data: updatedPurchaseRequest,
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// // Soft delete a PR
// export const deletePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;

//         const purchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 isDeleted: true,
//                 updatedBy: req.user?._id,
//                 updatedAt: new Date()
//             },
//             { new: true }
//         );

//         if (!purchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found or already deleted",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Purchase request deleted successfully",
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// // Update comparison summary
// export const updateComparisonSummary = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;
//         const { comparisonSummary } = req.body;

//         if (!comparisonSummary) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Comparison summary is required",
//                 status: 400
//             });
//         }

//         const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 // comparisonSummary,
//                 updatedBy: req.user?._id,
//                 updatedAt: new Date()
//             },
//             { new: true }
//         );

//         if (!updatedPurchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Comparison summary updated successfully",
//             data: updatedPurchaseRequest,
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// // Update supplier discount
// export const updateSupplierDiscount = async (req: Request, res: Response, next: NextFunction) => {
//     try {
//         const { id } = req.params;
//         const { discounts } = req.body;

//         if (!discounts || !Array.isArray(discounts)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Valid discounts array is required",
//                 status: 400
//             });
//         }

//         const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
//             { _id: id, isDeleted: false },
//             {
//                 discounts,
//                 updatedBy: req.user?._id,
//                 updatedAt: new Date()
//             },
//             { new: true }
//         );

//         if (!updatedPurchaseRequest) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Purchase request not found",
//                 status: 404
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Supplier discounts updated successfully",
//             data: updatedPurchaseRequest,
//             status: 200
//         });
//     } catch (error) {
//         next(error);
//     }
// };