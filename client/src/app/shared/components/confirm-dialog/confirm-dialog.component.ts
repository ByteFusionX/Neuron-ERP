import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CONFIRM_TONES, ConfirmConfig, ConfirmResult } from './confirm-dialog.model';

/**
 * Deliberate friction point before real-world consequences. One layout, four tones.
 * Cancel gets initial focus so Enter never confirms by accident. Prefer ConfirmDialogService over using this directly.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cd-backdrop fixed inset-0 z-[70] bg-gray-900/40 dark:bg-black/60" [class.cd-in]="visible" (click)="cancel()"></div>
    <div class="pointer-events-none fixed inset-0 z-[71] flex items-end justify-center p-4 sm:items-center">
      <div #panel role="alertdialog" aria-modal="true" [attr.aria-labelledby]="id + '-t'" [attr.aria-describedby]="id + '-m'"
        class="cd-panel pointer-events-auto w-full max-w-md overflow-hidden rounded-xl bg-white dark:bg-erp-surface-dark shadow-2xl ring-1 ring-gray-900/5 dark:ring-erp-border-dark"
        [class.cd-in]="visible" (keydown)="onKeydown($event)">
        <div class="flex gap-4 px-6 pb-4 pt-6">
          <span class="grid h-10 w-10 shrink-0 place-content-center rounded-full ring-4" [ngClass]="t.iconBox">
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" [attr.d]="t.icon" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <h2 [id]="id + '-t'" class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ config.title }}</h2>
            <p [id]="id + '-m'" class="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">{{ config.message }}</p>

            <dl *ngIf="config.details?.length" class="mt-3 divide-y divide-gray-100 dark:divide-erp-border-dark rounded-lg border border-gray-200 dark:border-erp-border-dark bg-gray-50/60 dark:bg-gray-800/40 text-[13px]">
              <div *ngFor="let d of config.details" class="flex justify-between gap-4 px-3 py-2">
                <dt class="text-gray-500 dark:text-gray-400">{{ d.label }}</dt>
                <dd class="text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">{{ d.value }}</dd>
              </div>
            </dl>

            <p *ngIf="config.consequence" class="mt-3 text-[13px] font-medium"
              [class.text-red-700]="config.tone === 'reject'" [class.text-amber-800]="config.tone === 'warning'"
              [class.text-gray-800]="config.tone === 'approve' || config.tone === 'note'"
              [ngClass]="{'dark:text-red-400': config.tone === 'reject', 'dark:text-amber-400': config.tone === 'warning', 'dark:text-gray-300': config.tone === 'approve' || config.tone === 'note'}">{{ config.consequence }}</p>

            <label *ngIf="config.reason" class="mt-3 block">
              <span class="text-[13px] font-medium text-gray-700 dark:text-gray-300">{{ config.reasonLabel || 'Reason' }}
                <span *ngIf="config.reason === 'optional'" class="font-normal text-gray-400 dark:text-gray-500">(optional)</span></span>
              <textarea [(ngModel)]="reason" rows="3" class="cd-field mt-1 resize-none" placeholder="This is recorded in the activity log"></textarea>
            </label>

            <label *ngIf="config.typeToConfirm" class="mt-3 block">
              <span class="text-[13px] text-gray-700 dark:text-gray-300">Type <strong class="font-semibold text-gray-900 dark:text-gray-100">{{ config.typeToConfirm }}</strong> to confirm</span>
              <input [(ngModel)]="typed" class="cd-field mt-1" autocomplete="off" spellcheck="false" />
            </label>
          </div>
        </div>

        <div class="flex flex-col-reverse gap-2 border-t border-gray-100 dark:border-erp-border-dark bg-gray-50/70 dark:bg-gray-800/40 px-6 py-3 sm:flex-row sm:justify-end">
          <button *ngIf="!config.acknowledgeOnly" #cancelBtn type="button" (click)="cancel()"
            class="h-9 rounded-lg border border-gray-300 dark:border-erp-border-dark bg-white dark:bg-transparent px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            {{ config.cancelLabel || 'Cancel' }}
          </button>
          <button #confirmBtn type="button" (click)="confirm()" [disabled]="!canConfirm"
            class="h-9 rounded-lg px-4 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            [ngClass]="t.button">
            {{ config.confirmLabel || t.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cd-backdrop { opacity: 0; transition: opacity 150ms ease; }
    .cd-panel { opacity: 0; transform: translateY(8px) scale(0.98); transition: opacity 150ms ease, transform 150ms ease; }
    .cd-in { opacity: 1; transform: none; }
    .cd-field { width: 100%; border-radius: 0.5rem; border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: #111827; background: #fff; }
    .cd-field:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); }
    :host-context(html.dark) .cd-field { border-color: #2e2b3d; background: #1c1930; color: #f3f4f6; }
    :host-context(html.dark) .cd-field::placeholder { color: #6b7280; }
  `],
})
export class ConfirmDialogComponent implements AfterViewInit, OnDestroy {
  private static seq = 0;
  @Input({ required: true }) config!: ConfirmConfig;
  @Output() closed = new EventEmitter<ConfirmResult>();
  @ViewChild('panel') panel!: ElementRef<HTMLElement>;
  @ViewChild('cancelBtn') cancelBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('confirmBtn') confirmBtn!: ElementRef<HTMLButtonElement>;

  readonly id = `cd-${++ConfirmDialogComponent.seq}`;
  visible = false;
  reason = '';
  typed = '';
  private cdr = inject(ChangeDetectorRef);
  private returnFocus = document.activeElement as HTMLElement | null;
  // capture phase on window runs before document listeners (e.g. the drawer's Escape), so one Escape closes only this dialog
  private escListener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    this.cancel();
  };

  get t() {
    return CONFIRM_TONES[this.config.tone];
  }

  get canConfirm(): boolean {
    if (this.config.reason === true && !this.reason.trim()) return false;
    if (this.config.typeToConfirm && this.typed.trim() !== this.config.typeToConfirm) return false;
    return true;
  }

  ngAfterViewInit(): void {
    window.addEventListener('keydown', this.escListener, true);
    requestAnimationFrame(() => {
      this.visible = true;
      this.cdr.detectChanges();
      (this.cancelBtn ?? this.confirmBtn).nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.escListener, true);
    this.returnFocus?.focus?.();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  cancel(): void {
    this.closed.emit({ confirmed: false });
  }

  confirm(): void {
    if (!this.canConfirm) return;
    this.closed.emit({ confirmed: true, reason: this.reason.trim() || undefined });
  }
}
