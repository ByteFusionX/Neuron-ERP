import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MODAL_DATA, ModalRef } from '../modal';
import { CONFIRM_TONES, ConfirmConfig, ConfirmResult } from './confirm-dialog.model';

/**
 * Deliberate friction point before real-world consequences. One layout, four tones.
 * Cancel gets initial focus so Enter never confirms by accident. Hosted inside ModalContainerComponent
 * by ConfirmDialogService — don't use directly.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- header -->
    <div class="flex items-start gap-3 border-b border-gray-100 dark:border-erp-border-dark px-6 py-4">
      <span class="grid h-9 w-9 shrink-0 place-content-center rounded-full ring-4" [ngClass]="t.iconBox">
        <svg class="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" [attr.d]="t.icon" /></svg>
      </span>
      <div class="min-w-0 flex-1 pt-0.5">
        <h2 class="text-[15px] font-semibold leading-tight text-gray-900 dark:text-gray-100">{{ config.title }}</h2>
        <p class="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">{{ config.message }}</p>
      </div>
    </div>

    <!-- body -->
    <div *ngIf="config.details?.length || config.consequence || config.reason || typeToConfirm || config.choices?.length" class="space-y-3 px-6 py-4">
        <dl *ngIf="config.details?.length" class="divide-y divide-gray-100 dark:divide-erp-border-dark rounded-lg border border-gray-200 dark:border-erp-border-dark bg-gray-50/60 dark:bg-gray-800/40 text-[13px]">
          <div *ngFor="let d of config.details" class="flex justify-between gap-4 px-3 py-2">
            <dt class="text-gray-500 dark:text-gray-400">{{ d.label }}</dt>
            <dd class="text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">{{ d.value }}</dd>
          </div>
        </dl>

        <p *ngIf="config.consequence" class="rounded-lg px-3 py-2 text-[13px] font-medium"
          [ngClass]="{
            'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400': config.tone === 'reject',
            'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400': config.tone === 'warning',
            'bg-gray-50 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300': config.tone === 'approve' || config.tone === 'note'
          }">{{ config.consequence }}</p>

        <fieldset *ngIf="config.choices?.length" class="space-y-2">
          <label *ngFor="let c of config.choices" class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5"
            [ngClass]="choice === c.value ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-950/20' : 'border-gray-200 dark:border-erp-border-dark'">
            <input type="radio" name="confirm-choice" class="mt-0.5 accent-violet-600" [value]="c.value" [(ngModel)]="choice" />
            <span class="min-w-0">
              <span class="block text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ c.label }}</span>
              <span *ngIf="c.hint" class="block text-xs text-gray-500 dark:text-gray-400">{{ c.hint }}</span>
            </span>
          </label>
        </fieldset>

        <label *ngIf="config.reason" class="block">
          <span class="text-[13px] font-medium text-gray-700 dark:text-gray-300">{{ config.reasonLabel || 'Reason' }}
            <span *ngIf="config.reason === 'optional'" class="font-normal text-gray-400 dark:text-gray-500">(optional)</span></span>
          <textarea [(ngModel)]="reason" rows="3" class="cd-field mt-1 resize-none" placeholder="This is recorded in the activity log"></textarea>
        </label>

        <label *ngIf="typeToConfirm" class="block">
          <span class="text-[13px] text-gray-700 dark:text-gray-300">Type <strong class="font-semibold text-gray-900 dark:text-gray-100">{{ typeToConfirm }}</strong> to confirm</span>
          <input [(ngModel)]="typed" class="cd-field mt-1" autocomplete="off" spellcheck="false" />
        </label>
    </div>

    <!-- footer -->
    <div class="flex flex-col-reverse gap-2 border-t border-gray-100 dark:border-erp-border-dark bg-gray-50/70 dark:bg-gray-800/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-end">
      <span class="hidden text-[11px] text-gray-400 sm:mr-auto sm:inline">
        <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Ctrl</kbd>
        + <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Enter</kbd> to {{ config.confirmLabel || t.confirmLabel | lowercase }}
      </span>
      <button *ngIf="!config.acknowledgeOnly" type="button" data-modal-autofocus (click)="cancel()"
        class="rounded-lg border border-gray-300 dark:border-erp-border-dark bg-white dark:bg-transparent px-3.5 py-2 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
        {{ config.cancelLabel || 'Cancel' }}
      </button>
      <button type="button" [attr.data-modal-autofocus]="config.acknowledgeOnly ? '' : null" (click)="confirm()" [disabled]="!canConfirm"
        class="rounded-lg px-3.5 py-2 text-[13px] font-medium text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        [ngClass]="t.button">
        {{ config.confirmLabel || t.confirmLabel }}
      </button>
    </div>
  `,
  styles: [`
    .cd-field { width: 100%; border-radius: 0.5rem; border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; font-size: 13px; color: #111827; background: #fff; }
    .cd-field:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); }
    :host-context(html.dark) .cd-field { border-color: #2e2b3d; background: #1a1a1a; color: #ededed; }
    :host-context(html.dark) .cd-field::placeholder { color: #8f8f8f; }
  `],
})
export class ConfirmDialogComponent {
  readonly config = inject(MODAL_DATA) as ConfirmConfig;
  private modalRef = inject(ModalRef<ConfirmResult>);

  reason = '';
  typed = '';
  choice = this.config.defaultChoice ?? this.config.choices?.[0]?.value ?? '';

  get t() {
    return CONFIRM_TONES[this.config.tone];
  }

  /** Text the user must type: the selected choice's own phrase, else the dialog-wide one. */
  get typeToConfirm(): string | undefined {
    return this.config.choices?.find((c) => c.value === this.choice)?.typeToConfirm ?? this.config.typeToConfirm;
  }

  get canConfirm(): boolean {
    if (this.config.reason === true && !this.reason.trim()) return false;
    if (this.typeToConfirm && this.typed.trim() !== this.typeToConfirm) return false;
    return true;
  }

  /** Ctrl/Cmd + Enter confirms, matching the footer hint and the form modals. Plain Enter still hits the focused Cancel. */
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented) return;
    e.preventDefault();
    this.confirm();
  }

  cancel(): void {
    this.modalRef.close({ confirmed: false });
  }

  confirm(): void {
    if (!this.canConfirm) return;
    this.modalRef.close({ confirmed: true, reason: this.reason.trim() || undefined, choice: this.config.choices?.length ? this.choice : undefined });
  }
}
