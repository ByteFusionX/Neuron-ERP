interface ApprovalRequiredItem {
  type?: string;
  message?: string;
  approverRole?: string;
  actual?: number | null;
  threshold?: number | null;
}

/**
 * One readable line for a failed approve call: the missing-information list, the approval rule that blocked it
 * (with the role that must approve), or the plain server message.
 */
export function describeApprovalGateError(err: any, fallback = 'Failed to approve'): string {
  const message = err?.error?.message || fallback;
  const missing: string[] = Array.isArray(err?.error?.missing) ? err.error.missing : [];
  const approvalRequired: ApprovalRequiredItem[] = Array.isArray(err?.error?.approvalRequired) ? err.error.approvalRequired : [];

  if (missing.length) {
    return `${message}: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`;
  }
  if (approvalRequired.length) {
    const first = approvalRequired[0];
    const approver = first?.approverRole ? ` Required approver: ${first.approverRole}.` : '';
    return `${first?.message || message}.${approver}`;
  }
  return message;
}
