import { Injectable, inject } from '@angular/core';
import { AlertService, AlertType } from './alert.service';

/** Titles that only repeat the alert type; the message becomes the title instead. */
const GENERIC_TITLES = new Set(['success', 'error', 'warning', 'info', 'failed', 'failure', 'alert', 'notice']);

/**
 * Stands in for ngx-toastr's ToastrService so existing `toastr.success(message, title)` calls
 * render as the new alerts without touching every caller.
 */
@Injectable()
export class ToastrAlertAdapter {
  private readonly alerts = inject(AlertService);

  success(message?: string, title?: string, override?: { timeOut?: number }) { return this.emit('success', message, title, override); }
  info(message?: string, title?: string, override?: { timeOut?: number }) { return this.emit('info', message, title, override); }
  warning(message?: string, title?: string, override?: { timeOut?: number }) { return this.emit('warning', message, title, override); }
  error(message?: string, title?: string, override?: { timeOut?: number }) { return this.emit('error', message, title, override); }
  show(message?: string, title?: string, override?: { timeOut?: number }) { return this.emit('info', message, title, override); }
  clear() {}
  remove() {}

  private emit(type: AlertType, message?: string, title?: string, override?: { timeOut?: number }) {
    const msg = (message ?? '').trim();
    const head = (title ?? '').trim();
    const generic = !head || GENERIC_TITLES.has(head.replace(/[\s!.:]+$/, '').toLowerCase());
    const opts = override?.timeOut ? { duration: override.timeOut } : undefined;
    const id = generic
      ? this.alerts[type](msg || head, undefined, opts)
      : this.alerts[type](head, msg || undefined, opts);
    return { toastId: id } as any;
  }
}
