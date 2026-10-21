import { Privileges } from '../interfaces/employee.interface';

type CrudFlags = { view: boolean; create: boolean; edit: boolean; delete: boolean };

// `main` only has one boolean (`portalManagement.department`) for departments. A role keeps that
// access until an admin sets the new `departments.*` flags explicitly; an explicit value always wins.
export function departmentPrivileges(p: Privileges | undefined): CrudFlags {
  const legacy = !!p?.portalManagement?.department;
  const d = p?.departments;
  return {
    view: d?.view ?? legacy,
    create: d?.create ?? legacy,
    edit: d?.edit ?? legacy,
    delete: d?.delete ?? legacy,
  };
}

// `main` gated every employee write on `employee.create`; edit/delete/block inherit it until set explicitly.
export function employeePrivileges(p: Privileges | undefined) {
  const e = p?.employee;
  const legacy = !!e?.create;
  return { edit: e?.edit ?? legacy, delete: e?.delete ?? legacy, block: e?.block ?? legacy };
}

// `main` left customer edit/delete open to anyone with view access.
export function customerPrivileges(p: Privileges | undefined) {
  const c = p?.customer;
  const viewer = !!c && c.viewReport !== 'none';
  return { edit: c?.edit ?? viewer, delete: c?.delete ?? viewer };
}

// `dealSheet` used to be one boolean covering view, approve, reject and revoke. A role keeps all of
// them until it is re-saved with the split object; an explicit value always wins.
export function dealSheetPrivileges(p: Privileges | undefined): { viewReport: string; approve: boolean; reject: boolean; revoke: boolean; update: boolean } {
  const d = p?.dealSheet;
  if (typeof d === 'boolean') {
    // The old boolean had no data scope; deals were scoped by the quotation view level, so keep that.
    const quoteScope = p?.quotation?.viewReport;
    return { viewReport: d ? (quoteScope && quoteScope !== 'none' ? quoteScope : 'all') : 'none', approve: d, reject: d, revoke: d, update: d };
  }
  return {
    viewReport: d?.viewReport ?? 'none',
    approve: d?.approve === true,
    reject: d?.reject === true,
    revoke: d?.revoke === true,
    // Roles split before `update` existed could always edit a deal they could see, so a missing value stays allowed.
    update: d?.update !== false && (d?.update === true || (!!d?.viewReport && d.viewReport !== 'none')),
  };
}

/** Whether this employee may approve, reject, revoke or update deals: role, individual grant (until it expires), or admin tier. */
export function canDoDealSheet(employee: any, action: 'approve' | 'reject' | 'revoke' | 'update'): boolean {
  const role = String(employee?.category?.role ?? '');
  if (/^(superadmin|admin)$/i.test(role)) return true;
  if (dealSheetPrivileges(employee?.category?.privileges)[action]) return true;
  const expiresAt = employee?.extraPrivilegesExpiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;
  const extra = employee?.extraPrivileges?.dealSheet;
  return extra === true || extra?.[action] === true;
}
