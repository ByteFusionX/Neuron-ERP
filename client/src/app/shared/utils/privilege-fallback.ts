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
