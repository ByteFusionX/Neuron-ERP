import { AuditLogEntry } from 'src/app/core/services/audit-log.service';
import { DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';

const ACTION_TONES: Record<string, DetailTimelineEntry['tone']> = {
  created: 'good', quoted: 'good', 'status-changed': 'info', 'presale-rejected': 'bad', deleted: 'bad',
  'attachment-removed': 'warn', 'estimation-deleted': 'warn', 'revision-requested': 'warn',
  'presale-returned': 'warn', 'resent-to-presale': 'info', 'sent-to-presale': 'info', 'estimation-uploaded': 'good',
};

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
