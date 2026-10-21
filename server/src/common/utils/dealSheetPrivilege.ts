export type DealSheetAction = 'view' | 'approve' | 'reject' | 'revoke';

/**
 * Reads a role's deal sheet privilege. Roles saved before the split hold a bare boolean, where
 * `true` meant everything (view, approve, reject, revoke). Newer roles hold
 * `{ viewReport, approve, reject, revoke }`.
 */
export const dealSheetCan = (privileges: any, action: DealSheetAction): boolean => {
    const dealSheet = privileges?.dealSheet;
    if (typeof dealSheet === 'boolean') return dealSheet;
    if (!dealSheet || typeof dealSheet !== 'object') return false;
    if (action === 'view') return !!dealSheet.viewReport && dealSheet.viewReport !== 'none';
    return dealSheet[action] === true;
};
