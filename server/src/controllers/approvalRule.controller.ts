import { Request, Response } from "express";
import ApprovalRule, { APPROVAL_RULE_TYPES } from '../models/approvalRule.model';

export const getApprovalRules = async (req: Request, res: Response) => {
    try {
        const rules = await ApprovalRule.find().populate('approverRole', 'categoryName');
        return res.status(200).json({ success: true, data: rules });
    } catch (error) {
        console.error('Error fetching approval rules:', error);
        return res.status(500).json({ success: false, message: "Failed to fetch approval rules" });
    }
};

// One rule per type: upsert by type.
export const saveApprovalRule = async (req: Request, res: Response) => {
    try {
        const { type } = req.params;
        if (!(APPROVAL_RULE_TYPES as readonly string[]).includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid rule type" });
        }
        const { enabled, threshold, approverRole } = req.body;
        const t = threshold === null || threshold === '' || threshold === undefined ? null : Number(threshold);
        if (t !== null && (Number.isNaN(t) || t < 0)) {
            return res.status(400).json({ success: false, message: "Threshold must be a non-negative number" });
        }
        if (enabled && !approverRole) {
            return res.status(400).json({ success: false, message: "Choose an approver role to enable this rule" });
        }
        const rule = await ApprovalRule.findOneAndUpdate(
            { type },
            { type, enabled: !!enabled, threshold: t, approverRole: approverRole || null },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).populate('approverRole', 'categoryName');
        return res.status(200).json({ success: true, data: rule });
    } catch (error) {
        console.error('Error saving approval rule:', error);
        return res.status(500).json({ success: false, message: "Failed to save approval rule" });
    }
};
