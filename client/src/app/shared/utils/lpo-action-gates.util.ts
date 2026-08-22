// Single source of truth for which LPO-level actions (edit/send-for-approval/
// re-issue/revoke) are available for a given LPO status. Shared between
// lpo-list.component.ts and item-issue-history-modal.component.ts so the two
// UIs can never drift out of sync on the same status rules.
export const LpoActionGates = {
  canEdit: (poStatus: string): boolean => poStatus === 'Draft' || poStatus === 'Rejected',
  canSendForApproval: (poStatus: string): boolean => poStatus === 'Draft' || poStatus === 'Rejected',
  canReIssue: (poStatus: string): boolean =>
    poStatus !== 'Draft' && poStatus !== 'Rejected' && poStatus !== 'Approved' && poStatus !== 'Closed',
  canRevoke: (poStatus: string): boolean => poStatus !== 'Approved' && poStatus !== 'Closed',
};
