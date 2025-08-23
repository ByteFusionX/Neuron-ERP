import { Request, Response, NextFunction } from "express";
import Workflow from '../models/workflow.model';
import { ObjectId } from "mongodb";
import { getEmployeeData } from "../common/utils/util";

export const createWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { feature, steps, needsManagerApproval } = req.body;

        if (!feature || !steps || !Array.isArray(steps)) {
            return res.status(400).json({
                success: false,
                message: "Feature and steps are required"
            });
        }

        const existingWorkflow = await Workflow.findOne({ feature });
        if (existingWorkflow) {
            return res.status(409).json({
                success: false,
                message: "Workflow for this feature already exists"
            });
        }

        const sortedSteps = steps.sort((a, b) => a.order - b.order);

        const workflow = await Workflow.create({
            feature,
            steps: sortedSteps,
            needsManagerApproval: needsManagerApproval || false
        });

        return res.status(201).json({
            success: true,
            message: "Workflow created successfully",
            data: workflow
        });

    } catch (error) {
        console.error('Error creating workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to create workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getWorkflows = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { feature, page = 1, row = 1000 } = req.query;

        const pageNum = parseInt(page as string);
        const rowNum = parseInt(row as string);
        const skip = (pageNum - 1) * rowNum;

        const filter: any = {};
        if (feature) {
            filter.feature = feature;
        }

        const workflows = await Workflow.find(filter)
            .sort({ feature: 1 })
            .populate('steps.role')
            .skip(skip)
            .limit(rowNum);

        const totalCount = await Workflow.countDocuments(filter);

        if (workflows.length > 0) {
            return res.status(200).json({
                success: true,
                data: workflows,
                pagination: {
                    page: pageNum,
                    row: rowNum,
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / rowNum)
                }
            });
        }

        return res.status(204).json({
            success: true,
            message: "No workflows found"
        });

    } catch (error) {
        console.error('Error fetching workflows:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch workflows",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { feature, steps, needsManagerApproval } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workflow ID"
            });
        }

        const workflow = await Workflow.findById(id);
        if (!workflow) {
            return res.status(404).json({
                success: false,
                message: "Workflow not found"
            });
        }

        if (feature && feature !== workflow.feature) {
            const existingWorkflow = await Workflow.findOne({ 
                feature, 
                _id: { $ne: id } 
            });
            if (existingWorkflow) {
                return res.status(409).json({
                    success: false,
                    message: "Another workflow for this feature already exists"
                });
            }
        }

        const updateData: any = {};
        if (feature) updateData.feature = feature;
        if (steps && Array.isArray(steps)) {
            updateData.steps = steps.sort((a, b) => a.order - b.order);
        }
        if (needsManagerApproval !== undefined) {
            updateData.needsManagerApproval = needsManagerApproval;
        }

        const updatedWorkflow = await Workflow.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: "Workflow updated successfully",
            data: updatedWorkflow
        });

    } catch (error) {
        console.error('Error updating workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const deleteWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid workflow ID"
            });
        }

        const workflow = await Workflow.findById(id);
        if (!workflow) {
            return res.status(404).json({
                success: false,
                message: "Workflow not found"
            });
        }

        await Workflow.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: "Workflow deleted successfully"
        });

    } catch (error) {
        console.error('Error deleting workflow:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete workflow",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
