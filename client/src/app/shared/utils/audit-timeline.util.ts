import { AuditLogEntry } from 'src/app/core/services/audit-log.service';
import { DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';

const ACTION_TONES: Record<string, DetailTimelineEntry['tone']> = {
  created: 'good', quoted: 'good', 'status-changed': 'info', 'presale-rejected': 'bad', deleted: 'bad',
  'attachment-removed': 'warn', 'estimation-deleted': 'warn', 'revision-requested': 'warn',
  'presale-returned': 'warn', 'resent-to-presale': 'info', 'sent-to-presale': 'info', 'estimation-uploaded': 'good',
  approved: 'good', rejected: 'bad', blocked: 'bad', unblocked: 'good',
  transferred: 'info', 'role-changed': 'info', 'approval-limit-changed': 'info', 'privilege-granted': 'good', 'privilege-revoked': 'warn',
  renamed: 'info', hidden: 'warn', unhidden: 'good',
  submitted: 'info', resubmitted: 'info', placed: 'info', reissued: 'info', 'workflow-reset': 'warn',
  cancelled: 'bad', 'partly-cancelled': 'warn', revoked: 'bad',
  allocated: 'info', 'procurement-transferred': 'info', completed: 'good', lost: 'bad',
  'lpo-closed': 'good', 'return-sent': 'warn', 'return-resolved': 'good',
  dispatched: 'info', delivered: 'good', 'pod-files': 'info', 'items-rejected': 'bad',
};

/** Friendly module names for the entity types recorded in the audit log. */
const AUDIT_MODULE_LABELS: Record<string, string> = {
  enquiry: 'Enquiry', quotation: 'Quotation', job: 'Job Sheet', customer: 'Customer', employee: 'Employee',
  supplier: 'Supplier', product: 'Product', masterList: 'Master List', announcement: 'Announcement',
  purchaseRequest: 'Purchase Request', generalPurchaseRequest: 'General Purchase Request',
  purchaseOrder: 'Purchase Order (LPO)', grn: 'GRN', deliveryNote: 'Delivery Note',
};

export function auditModuleLabel(type: string): string {
  return AUDIT_MODULE_LABELS[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Unknown');
}

export const formatAuditDate = (at: string): string =>
  new Date(at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Turns audit-log rows into <app-detail-timeline> entries, so every module's history tab looks the same. */
export const toTimelineEntries = (entries: AuditLogEntry[] | null | undefined): DetailTimelineEntry[] =>
  (entries || []).map((entry) => ({
    text: entry.summary,
    meta: [entry.actorName, formatAuditDate(entry.at)].filter(Boolean).join(' · '),
    tone: ACTION_TONES[entry.action] ?? 'neutral',
    changes: entry.changes?.map((c) => ({ label: c.label, from: c.from ?? '—', to: c.to ?? '—' })),
  }));
