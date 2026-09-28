import { Request, Response, NextFunction } from "express";
import Workflow from '../models/workflow.model';
import WorkflowDelegation from "../models/workflowDelegation.model";
import { ObjectId } from "mongodb";
import { getEmployeeData } from "../common/utils/util";

const validateWorkflowSteps = (steps: any[]) => {
    if (!Array.isArray(steps) || steps.length === 0) {
        return { valid: false, message: "At least one approval step is required" };
    }

    const roleIds = new Set<string>();
    const stepRoleKeys = new Set<string>();

    for (const step of steps) {
        const roleId = step?.role?.toString();
        const order = Number(step?.order);
        const stepKey = `${order}:${roleId}`;

        if (!roleId || !ObjectId.isValid(roleId)) {
            return { valid: false, message: "Each approval step must have a valid role" };
        }

        if (!Number.isInteger(order) || order < 1) {
            return { valid: false, message: "Each approval step must have a positive order" };
        }

        if (roleIds.has(roleId)) {
            return { valid: false, message: "Duplicate roles are not allowed in a workflow" };
        }

        if (step?.escalationRole && !ObjectId.isValid(step.escalationRole.toString())) {
            return { valid: false, message: "Escalation role must be valid" };
        }

        if (step?.escalationHours !== undefined && (!Number.isInteger(Number(step.escalationHours)) || Number(step.escalationHours) < 1)) {
            return { valid: false, message: "Escalation hours must be a positive number" };
        }

        if (stepRoleKeys.has(stepKey)) {
            return { valid: false, message: "Duplicate roles are not allowed in the same workflow step" };
        }

        roleIds.add(roleId);
        stepRoleKeys.add(stepKey);
    }

    return { valid: true };
};

const normalizeWorkflowSteps = (steps: any[]) => {
    return [...steps]
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map((step) => ({
            role: step.role,
            order: Number(step.order),
            escalationHours: step.escalationHours === undefined ? 48 : Number(step.escalationHours),
            escalationRole: step.escalationRole || undefined
        }));
};

const validateConditions = (conditions: any[] = []) => {
    const operators = new Set(['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'in', 'notIn', 'exists']);
    for (const condition of conditions) {
        if (!condition?.field || typeof condition.field !== 'string') {
            return { valid: false, message: "Each condition must have a field" };
        }

        if (!operators.has(condition?.operator)) {
            return { valid: false, message: "Each condition must have a valid operator" };
        }
    }

    return { valid: true };
};

const validateAutoActions = (autoActions: any[] = []) => {
    const actions = new Set(['createSalesOrder', 'createProject']);
    for (const autoAction of autoActions) {
        if (!autoAction?.triggerStatus || typeof autoAction.triggerStatus !== 'string') {
            return { valid: false, message: "Each auto action must have a trigger status" };
        }

        if (!actions.has(autoAction?.action)) {
            return { valid: false, message: "Each auto action must have a valid action" };
        }
    }

    return { valid: true };
};

export const createWorkflow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { feature, steps, needsManagerApproval, conditions = [], autoActions = [] } = req.body;

        if (!feature || !steps || !Array.isArray(steps)) {
            return res.status(400).json({
                success: false,
                message: "Feature and steps are required"
            });
        }

        const stepValidation = validateWorkflowSteps(steps);
        if (!stepValidation.valid) {
            return res.status(400).json({
                success: false,
                message: stepValidation.message
            });
        }

        const conditionValidation = validateConditions(conditions);
        if (!conditionValidation.valid) {
            return res.status(400).json({
                success: false,
                message: conditionValidation.message
            });
        }

        const autoActionValidation = validateAutoActions(autoActions);
        if (!autoActionValidation.valid) {
            return res.status(400).json({
                success: false,
                message: autoActionValidation.message
            });
        }

        const existingWorkflow = await Workflow.findOne({ feature });
        if (existingWorkflow) {
            return res.status(409).json({
                success: false,
                message: "Workflow for this feature already exists"
            });
        }

        const sortedSteps = normalizeWorkflowSteps(steps);

        const workflow = await Workflow.create({
            feature,
            steps: sortedSteps,
            needsManagerApproval: needsManagerApproval || false,
            conditions,
            autoActions
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
        const { feature, steps, needsManagerApproval, conditions, autoActions } = req.body;

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
        if (steps !== undefined) {
            const stepValidation = validateWorkflowSteps(steps);
            if (!stepValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: stepValidation.message
                });
            }

            updateData.steps = normalizeWorkflowSteps(steps);
        }
        if (needsManagerApproval !== undefined) {
            updateData.needsManagerApproval = needsManagerApproval;
        }
        if (conditions !== undefined) {
            const conditionValidation = validateConditions(conditions);
            if (!conditionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: conditionValidation.message
                });
            }
            updateData.conditions = conditions;
        }
        if (autoActions !== undefined) {
            const autoActionValidation = validateAutoActions(autoActions);
            if (!autoActionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: autoActionValidation.message
                });
            }
            updateData.autoActions = autoActions;
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

export const createWorkflowDelegation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fromEmployee, toEmployee, startDate, endDate, reason } = req.body;
        const employee = await getEmployeeData(req.user);

        if (!ObjectId.isValid(fromEmployee) || !ObjectId.isValid(toEmployee)) {
            return res.status(400).json({ success: false, message: "Valid from and to employees are required" });
        }

        if (fromEmployee === toEmployee) {
            return res.status(400).json({ success: false, message: "Delegation must be assigned to another employee" });
        }

        const startsAt = new Date(startDate);
        const endsAt = new Date(endDate);
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt > endsAt) {
            return res.status(400).json({ success: false, message: "Valid delegation start and end dates are required" });
        }

        const delegation = await WorkflowDelegation.create({
            fromEmployee,
            toEmployee,
            startDate: startsAt,
            endDate: endsAt,
            reason,
            createdBy: employee._id
        });

        return res.status(201).json({
            success: true,
            message: "Workflow delegation created successfully",
            data: delegation
        });
    } catch (error) {
        console.error('Error creating workflow delegation:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to create workflow delegation",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const getWorkflowDelegations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { active } = req.query;
        const filter: any = {};
        if (active !== undefined) filter.active = active === 'true';

        const delegations = await WorkflowDelegation.find(filter)
            .populate('fromEmployee', 'firstName lastName employeeId')
            .populate('toEmployee', 'firstName lastName employeeId')
            .populate('createdBy', 'firstName lastName')
            .sort({ startDate: -1 });

        return res.status(200).json({
            success: true,
            data: delegations
        });
    } catch (error) {
        console.error('Error fetching workflow delegations:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch workflow delegations",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

export const updateWorkflowDelegation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { toEmployee, startDate, endDate, reason, active } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid delegation ID" });
        }

        const updateData: any = { updatedAt: new Date() };
        if (toEmployee !== undefined) {
            if (!ObjectId.isValid(toEmployee)) {
                return res.status(400).json({ success: false, message: "Valid delegate employee is required" });
            }
            updateData.toEmployee = toEmployee;
        }
        if (startDate !== undefined) updateData.startDate = new Date(startDate);
        if (endDate !== undefined) updateData.endDate = new Date(endDate);
        if (reason !== undefined) updateData.reason = reason;
        if (active !== undefined) updateData.active = active;

        if ((updateData.startDate && Number.isNaN(updateData.startDate.getTime())) || (updateData.endDate && Number.isNaN(updateData.endDate.getTime()))) {
            return res.status(400).json({ success: false, message: "Valid delegation dates are required" });
        }

        const updatedDelegation = await WorkflowDelegation.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!updatedDelegation) {
            return res.status(404).json({ success: false, message: "Workflow delegation not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Workflow delegation updated successfully",
            data: updatedDelegation
        });
    } catch (error) {
        console.error('Error updating workflow delegation:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to update workflow delegation",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
