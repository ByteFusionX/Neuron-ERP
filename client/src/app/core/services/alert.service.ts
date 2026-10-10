import { Injectable, computed, signal } from '@angular/core';

export type AlertType = 'success' | 'info' | 'warning' | 'error';

export interface AlertItem {
  id: number;
  kind: 'message' | 'action';
  type: AlertType;
  title: string;
  message?: string;
  /** Milliseconds before the alert closes on its own; 0 keeps it until closed. */
  duration: number;
  actionLabel?: string;
  onAction?: () => void;
  onExpire?: () => void;
  /** Set after the action ran, the card then shows a short confirmation. */
  done?: boolean;
  leaving?: boolean;
}

export interface MessageOptions {
  duration?: number;
}

export interface ActionOptions {
  title: string;
  message?: string;
  actionLabel?: string;
  duration?: number;
  onAction: () => void;
  onExpire?: () => void;
}

const DEFAULT_DURATION: Record<AlertType, number> = {
  success: 4000,
  info: 6000,
  warning: 6000,
  error: 8000,
};

const EXIT_MS = 180;
const MAX_VISIBLE = 4;

@Injectable({ providedIn: 'root' })
export class AlertService {
  private nextId = 1;
  private readonly items = signal<AlertItem[]>([]);

  readonly messages = computed(() => this.items().filter((a) => a.kind === 'message').slice(-MAX_VISIBLE));
  readonly hiddenCount = computed(() => Math.max(0, this.items().filter((a) => a.kind === 'message').length - MAX_VISIBLE));
  readonly actionAlert = computed(() => this.items().filter((a) => a.kind === 'action').at(-1));

  success(title: string, message?: string, opts?: MessageOptions) { return this.show('success', title, message, opts); }
  info(title: string, message?: string, opts?: MessageOptions) { return this.show('info', title, message, opts); }
  warning(title: string, message?: string, opts?: MessageOptions) { return this.show('warning', title, message, opts); }
  error(title: string, message?: string, opts?: MessageOptions) { return this.show('error', title, message, opts); }

  /** An alert with one button (e.g. Undo). A newer action alert replaces the current one, which counts as expired. */
  action(opts: ActionOptions): number {
    const current = this.actionAlert();
    if (current && !current.done) this.expire(current.id);
    return this.push({
      kind: 'action',
      type: 'info',
      title: opts.title,
      message: opts.message,
      actionLabel: opts.actionLabel ?? 'Undo',
      duration: opts.duration ?? 8000,
      onAction: opts.onAction,
      onExpire: opts.onExpire,
    });
  }

  runAction(id: number) {
    const alert = this.find(id);
    if (!alert || alert.done) return;
    alert.onAction?.();
    this.patch(id, { done: true });
    setTimeout(() => this.dismiss(id), 1500);
  }

  /** Timer ran out: for action alerts the removal becomes final. */
  expire(id: number) {
    const alert = this.find(id);
    if (!alert) return;
    if (alert.kind === 'action' && !alert.done) alert.onExpire?.();
    this.dismiss(id);
  }

  dismiss(id: number) {
    const alert = this.find(id);
    if (!alert || alert.leaving) return;
    this.patch(id, { leaving: true });
    setTimeout(() => this.items.update((list) => list.filter((a) => a.id !== id)), EXIT_MS);
  }

  private show(type: AlertType, title: string, message?: string, opts?: MessageOptions): number {
    return this.push({ kind: 'message', type, title, message, duration: opts?.duration ?? DEFAULT_DURATION[type] });
  }

  private push(alert: Omit<AlertItem, 'id'>): number {
    const id = this.nextId++;
    this.items.update((list) => [...list, { ...alert, id }]);
    return id;
  }

  private find(id: number) {
    return this.items().find((a) => a.id === id);
  }

  private patch(id: number, changes: Partial<AlertItem>) {
    this.items.update((list) => list.map((a) => (a.id === id ? { ...a, ...changes } : a)));
  }

}
