import { Injectable, Injector } from '@angular/core';
import { bugReportRedactionConfig } from './bug-report-redaction.config';

/**
 * Assembles the "app state" section of a bug report by running the
 * Step 1 allowlist against the current app: for each registered service,
 * resolve it from the injector and run its `extract` function. Nothing
 * outside `bugReportRedactionConfig` is ever read (Phase 1, Step 5).
 */
@Injectable({ providedIn: 'root' })
export class BugReportStateSnapshotService {
  constructor(private readonly injector: Injector) {}

  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const entry of bugReportRedactionConfig) {
      const instance = this.injector.get(entry.service, null);
      if (!instance) {
        continue;
      }
      try {
        result[entry.label] = entry.extract(instance);
      } catch (err) {
        console.warn(`Bug report snapshot: failed to extract '${entry.label}'`, err);
      }
    }

    return result;
  }
}
