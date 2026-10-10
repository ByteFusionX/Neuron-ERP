/**
 * Supplier banking details (bank account, IBAN, banking documents) are for the finance team only:
 * roles with the Finance sidebar group enabled, plus super admins. UI-level gate — the API does
 * not enforce it yet (see the banking-info restriction TODO).
 */
export function canAccessBanking(employee: any): boolean {
  const category = employee?.category;
  return category?.role === 'superAdmin' || category?.privileges?.groups?.finance?.enabled === true;
}
