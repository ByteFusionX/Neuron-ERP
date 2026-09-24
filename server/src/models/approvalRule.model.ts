import { Types, model, Schema } from "mongoose";

export const APPROVAL_RULE_TYPES = ['discount', 'margin', 'paymentTerms', 'creditException', 'deal'] as const;

export interface ApprovalRule {
    type: typeof APPROVAL_RULE_TYPES[number];
    enabled: boolean;
    // Approval is required when the value goes beyond this (percent for discount/margin,
    // days for paymentTerms, amount for creditException/deal). Unused if null.
    threshold: number | null;
    approverRole: Types.ObjectId | null;
}

const approvalRuleSchema = new Schema<ApprovalRule>({
    type: { type: String, required: true, enum: APPROVAL_RULE_TYPES, unique: true },
    enabled: { type: Boolean, default: false },
    threshold: { type: Number, default: null, min: 0 },
    approverRole: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
});

export default model<ApprovalRule>('ApprovalRule', approvalRuleSchema);
