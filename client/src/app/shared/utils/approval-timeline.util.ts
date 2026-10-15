import { DetailTimelineEntry } from '../components/detail-panel/detail-panel.model';
import { DetailTone } from '../components/detail-panel/detail-tone';

const fullName = (e: any): string => (e && typeof e === 'object' ? `${e.firstName ?? ''} ${e.lastName ?? ''}`.replace(/\s+/g, ' ').trim() : '');

const when = (value: any): string => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

const TONES: Record<string, DetailTone> = { approved: 'good', rejected: 'bad', pending: 'warn' };

/**
 * One timeline entry per approval step, for any approval-workflow record (PR, LPO, ...):
 * numbered by position (the stored step index can start at 0 or skip), naming who or which role
 * the step waits on, who acted and when, and when a waiting step is due or was escalated.
 */
export function buildApprovalTimeline(approvals: any[] | null | undefined): DetailTimelineEntry[] {
  const steps = [...(approvals ?? [])].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  return steps.map((s, i) => {
    const status = String(s.status || 'pending').toLowerCase();
    const roleName = s.role?.categoryName;
    const who = s.managerApproval ? `Reporting manager${fullName(s.approver) ? ` (${fullName(s.approver)})` : ''}` : (roleName || 'Approver');
    const actor = fullName(s.updatedBy);
    const done = when(s.updatedDate || s.updatedAt);
    const meta: string[] = [];
    if (status === 'pending') {
      if (s.escalatedAt) meta.push(`Escalated ${when(s.escalatedAt)}${s.originalRole ? ' — the original role can no longer decide' : ''}`);
      else if (s.escalationDueAt) meta.push(`Due ${when(s.escalationDueAt)}`);
      else if (s.assignedAt) meta.push(`Waiting since ${when(s.assignedAt)}`);
    } else {
      if (actor) meta.push(actor);
      if (done) meta.push(done);
    }
    if (s.comment) meta.push(`“${s.comment}”`);
    return {
      text: `Stage ${i + 1} · ${who} — ${status}`,
      meta: meta.join(' · '),
      tone: TONES[status] ?? 'neutral',
    } as DetailTimelineEntry;
  });
}
