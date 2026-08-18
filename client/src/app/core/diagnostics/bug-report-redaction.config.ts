import { Type } from '@angular/core';
import { SameRouteNavigationService } from '../services/same-route-navigation.service';
import { PushNotificationService } from '../services/push-notification.service';

/**
 * Default-deny allowlist for the bug-report state snapshot (Phase 1, Step 5).
 *
 * This app has no central NgRx store — state lives in per-domain services
 * (BehaviorSubjects/signals). Every entry below names one service and one
 * `extract` function that returns ONLY the fields safe to attach to a bug
 * report. Anything not listed here is excluded by construction: adding a
 * new service, or a new field to an existing service, requires a deliberate
 * opt-in edit to this file before it can ever reach a report.
 *
 * Do NOT add: auth tokens (localStorage['employeeToken']), employee PII
 * (email, dob, contactNo), financial fields (salesValue, targets), or any
 * customer/purchase/invoice/quotation/supplier/profile service state.
 */
export interface RedactionAllowlistEntry<T = any> {
  /** Injectable service class this entry reads from. */
  service: Type<T>;
  /** Short label for the resulting snapshot key, for readability in the report. */
  label: string;
  /** Pulls only the allowlisted fields out of the service instance. */
  extract: (instance: T) => Record<string, unknown>;
}

export const bugReportRedactionConfig: RedactionAllowlistEntry[] = [
  {
    service: PushNotificationService,
    label: 'pushNotifications',
    extract: (svc: PushNotificationService) => ({
      subscribed: svc.subscribedSubject.value,
    }),
  },
  {
    service: SameRouteNavigationService,
    label: 'sameRouteNavigation',
    extract: (svc: SameRouteNavigationService) => ({
      bypassingRouteReuse: svc.shouldBypassRouteReuse(),
    }),
  },
  // PaginationService is deliberately excluded: it is provided per-component
  // (not `providedIn: 'root'`), so a global snapshot has no way to reach the
  // instance backing the screen the user was actually on — injecting it here
  // would silently return an unrelated/default instance and misreport state.
];
