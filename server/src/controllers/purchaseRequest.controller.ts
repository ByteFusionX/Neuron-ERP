import { NextFunction, Request, Response } from "express";


import { PurchaseRequest, PurchaseRequestStatus } from "../models/purchaseRequest.model";
import mongoose from "mongoose";

// Create a new Purchase Request
export const createPurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { 
            jobId, 
            purchaseNo, 
            items, 
            discounts, 
            status,
            createdBy, 
            createdAt, 
            isDeleted 
        } = req.body;

        // Validate required fields
        if (!jobId || !purchaseNo || !items || !items.length) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
                status: 400
            });
        }

        // Create new purchase request
        const newPurchaseRequest = new PurchaseRequest({
            jobId,
            purchaseNo,
            items,
            discounts: discounts || [],
            status: status || PurchaseRequestStatus.Drafted,
            createdBy: createdBy, 
            createdAt: createdAt ,
            updatedBy: createdBy ,
            updatedAt: new Date(),
            isDeleted: isDeleted || false
        });

        const savedPurchaseRequest = await newPurchaseRequest.save();

        return res.status(201).json({
            success: true,
            message: "Purchase request created successfully!",
            data: savedPurchaseRequest,
            status: 201
        });
    } catch (error) {
        next(error);
    }
};

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

        const purchaseRequests = await PurchaseRequest.find({
            status,
            isDeleted: false
        }).populate('jobId').populate('createdBy', 'name email');

        return res.status(200).json({
            success: true,
            message: `Purchase requests with status ${status} fetched successfully`,
            data: purchaseRequests,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Get PR details by ID
export const getPurchaseRequestById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const purchaseRequest = await PurchaseRequest.findOne({
            _id: id,
            isDeleted: false
        }).populate('jobId')
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email');

        if (!purchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }

        return res.status(200).json({
            success: true,
            message: "Purchase request fetched successfully",
            data: purchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Generate a new purchase number
export const generatePurchaseNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get current year and month
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2); // Last two digits of year
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month padded with 0
        
        // Find the latest purchase request to determine the next number
        const latestPR = await PurchaseRequest.findOne({
            purchaseNo: { $regex: `^PR-${year}${month}-` }
        })
        .sort({ purchaseNo: -1 })
        .limit(1);
        
        let nextNumber = 1;
        
        if (latestPR) {
            // Extract the sequence number from the latest PR number
            const parts = latestPR.purchaseNo.split('-');
            if (parts.length === 3) {
                nextNumber = parseInt(parts[2]) + 1;
            }
        }
        
        // Format the new purchase number
        const newPurchaseNumber = `PR-${year}${month}-${nextNumber.toString().padStart(4, '0')}`;
        
        return res.status(200).json({
            success: true,
            message: "Purchase number generated successfully",
            data: { purchaseNo: newPurchaseNumber },
            status: 200
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
        
        // If status is changing to Rejected, require rejected reason
        if (status === PurchaseRequestStatus.Rejected) {
            if (!rejectedReason || !rejectedReason.comment) {
                return res.status(400).json({
                    success: false,
                    message: "Rejection reason is required",
                    status: 400
                });
            }
            
            // Add rejected reason to the array
            purchaseRequest.rejectedReason.push({
                rejectedBy: req.user?._id || rejectedReason.rejectedBy,
                comment: rejectedReason.comment,
                rejectedAt: new Date()
            });
        }
        
        // Update status and other fields
        purchaseRequest.status = status;
        purchaseRequest.updatedBy = req.user?._id;
        purchaseRequest.updatedAt = new Date();
        
        const updatedPurchaseRequest = await purchaseRequest.save();
        
        return res.status(200).json({
            success: true,
            message: "Purchase request status updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Edit a PR
export const updatePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        // Remove fields that shouldn't be directly updated
        delete updateData._id;
        delete updateData.purchaseNo;
        delete updateData.createdAt;
        delete updateData.createdBy;
        delete updateData.isDeleted;
        
        // Add updated metadata
        updateData.updatedBy = req.user?._id;
        updateData.updatedAt = new Date();
        
        const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { $set: updateData },
            { new: true, runValidators: true }
        );
        
        if (!updatedPurchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Purchase request updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Soft delete a PR
export const deletePurchaseRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        
        const purchaseRequest = await PurchaseRequest.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { 
                isDeleted: true,
                updatedBy: req.user?._id,
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!purchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found or already deleted",
                status: 404
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Purchase request deleted successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Update comparison summary
export const updateComparisonSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { comparisonSummary } = req.body;
        
        if (!comparisonSummary) {
            return res.status(400).json({
                success: false,
                message: "Comparison summary is required",
                status: 400
            });
        }
        
        const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { 
                // comparisonSummary,
                updatedBy: req.user?._id,
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!updatedPurchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Comparison summary updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Update supplier discount
export const updateSupplierDiscount = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { discounts } = req.body;
        
        if (!discounts || !Array.isArray(discounts)) {
            return res.status(400).json({
                success: false,
                message: "Valid discounts array is required",
                status: 400
            });
        }
        
        const updatedPurchaseRequest = await PurchaseRequest.findOneAndUpdate(
            { _id: id, isDeleted: false },
            { 
                discounts,
                updatedBy: req.user?._id,
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!updatedPurchaseRequest) {
            return res.status(404).json({
                success: false,
                message: "Purchase request not found",
                status: 404
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Supplier discounts updated successfully",
            data: updatedPurchaseRequest,
            status: 200
        });
    } catch (error) {
        next(error);
    }
};