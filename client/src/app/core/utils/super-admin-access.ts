import { getEmployee } from 'src/app/shared/interfaces/employee.interface';

export const isSuperAdminRole = (role?: string | null): boolean => /^superadmin$/i.test(role ?? '');

const FLAG_KEY = /^(can|create|edit|delete|block|share|transfer|assign|reject|estimate|reassign|feedback|revision|lpo|statusUpdate|allocate|approve|recycle|bugReports|update|upload|issue|initiate|manage|export|import)/;

// Anything the stored privileges don't define still resolves to full access, so new modules never lock a super admin out.
function fullAccess(source: any): any {
  const target = source && typeof source === 'object' ? source : {};
  return new Proxy(target, {
    get(obj, key) {
      if (typeof key === 'symbol' || key === 'toJSON' || key === 'then') return Reflect.get(obj, key);
      const value = Reflect.get(obj, key);
      if (key === 'viewReport') return 'all';
      if (typeof value === 'boolean') return true;
      if (value && typeof value === 'object') return fullAccess(value);
      if (typeof value === 'string' && value !== '') return value === 'none' ? 'all' : value;
      if (value !== undefined && value !== null) return value;
      return FLAG_KEY.test(String(key)) ? true : fullAccess({});
    },
  });
}

/** A super admin sees every module and page regardless of the privileges saved on their role. */
export function withSuperAdminAccess(employee: getEmployee): getEmployee {
  if (!employee?.category || !isSuperAdminRole(employee.category.role)) return employee;
  return { ...employee, category: { ...employee.category, privileges: fullAccess(employee.category.privileges) } };
}
