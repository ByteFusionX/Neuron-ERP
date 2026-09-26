import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Privileges } from 'src/app/shared/interfaces/employee.interface';

export type SettingsEditFlag =
  | 'companyProfileEdit'
  | 'numberingEdit'
  | 'masterDataEdit'
  | 'approvalRulesEdit'
  | 'notificationsEdit'
  | 'auditEdit';

/** True when the signed-in user may change this Settings area (superAdmin always may). Call in a field initializer. */
export function settingsEditAccess(flag: SettingsEditFlag): Signal<boolean> {
  const employees = inject(EmployeeService);
  return toSignal(
    employees.employeeData$.pipe(
      map((e) => {
        if (!e) return false;
        const p: Privileges | undefined = e.category?.privileges;
        return e.category?.role === 'superAdmin' || !!p?.portalManagement?.[flag];
      }),
    ),
    { initialValue: false },
  );
}
