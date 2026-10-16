/**
 * Supplier banking details (bank account, IBAN, banking documents) are for the finance team only:
 * roles with the Finance sidebar group enabled, plus super admins. UI-level gate — the API does
 * not enforce it yet (see the banking-info restriction TODO).
 */
export function canAccessBanking(employee: any): boolean {
  const category = employee?.category;
  return /^superadmin$/i.test(String(category?.role ?? '')) || category?.privileges?.groups?.finance?.enabled === true;
}

/** The create/edit drawer's banking step is editable by super admins only. */
export function canEditBanking(employee: any): boolean {
  return /^superadmin$/i.test(String(employee?.category?.role ?? ''));
}
