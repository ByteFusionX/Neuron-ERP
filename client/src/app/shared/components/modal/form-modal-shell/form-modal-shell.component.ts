import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailPanelIconComponent } from '../../detail-panel/detail-panel-icon.component';

export type FormModalShellTone = 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';

const TONE_CLASSES: Record<FormModalShellTone, string> = {
  sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-900',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900',
};

/**
 * Shared header/body/footer chrome for small "create X" modals (event, follow-up, approval
 * limit, etc.) — anything that isn't a full drawer or a yes/no confirmation. Projects the
 * form as body content; header and footer are built from inputs so every one of these small
 * modals looks and behaves the same.
 *
 *   <app-form-modal-shell icon="calendar" tone="sky" title="New event" [context]="data?.context"
 *     contextEmptyText="Schedule a meeting, visit or milestone." formId="event-create-form"
 *     [invalid]="form.invalid && submitted" submitLabel="Create event"
 *     (closed)="close()">
 *     <form id="event-create-form" ...>...</form>
 *     <div footerExtra>...optional checkbox / helper...</div>
 *   </app-form-modal-shell>
 */
@Component({
  selector: 'app-form-modal-shell',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <!-- Header -->
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span *ngIf="icon" class="grid h-9 w-9 shrink-0 place-content-center rounded-lg ring-1 ring-inset" [ngClass]="toneClasses">
          <app-dp-icon [name]="icon" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">{{ title }}</h2>
          <p *ngIf="context || contextEmptyText" class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="context; else noCtx">
              {{ contextLabel }}
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ context }}</span>
            </ng-container>
            <ng-template #noCtx>{{ contextEmptyText }}</ng-template>
          </p>
        </div>
        <button type="button" (click)="closed.emit()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <!-- Body (projected form) -->
      <div class="flex-1 overflow-y-auto px-6 py-5">
        <ng-content></ng-content>
      </div>

      <!-- Footer -->
      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <ng-content select="[footerExtra]"></ng-content>
        <span *ngIf="invalid" class="text-xs text-red-600 dark:text-red-400">{{ invalidText }}</span>
        <span *ngIf="showShortcutHint" class="ml-auto hidden text-[11px] text-gray-400 sm:inline">
          <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Ctrl</kbd>
          + <kbd class="rounded border border-gray-200 bg-white px-1 font-sans dark:border-erp-border-dark dark:bg-gray-800">Enter</kbd> to {{ submitShortcutVerb }}
        </span>
        <div class="flex gap-2" [class.ml-auto]="!showShortcutHint" [class.max-sm:ml-auto]="showShortcutHint">
          <button type="button" (click)="closed.emit()"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">{{ cancelLabel }}</button>
          <button type="submit" [attr.form]="formId" [disabled]="saving"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            <app-dp-icon *ngIf="submitIcon && !saving" [name]="submitIcon" size="w-3.5 h-3.5"></app-dp-icon>{{ saving ? savingLabel : submitLabel }}
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class FormModalShellComponent {
  /** Icon name for the header badge (detail-panel icon set); omit to hide the badge. */
  @Input() icon?: string;
  /** Header badge color; defaults to violet. */
  @Input() tone: FormModalShellTone = 'violet';
  @Input() title = '';
  /** Word before the context chip, e.g. "Adding to". */
  @Input() contextLabel = 'Adding to';
  /** Value shown as a chip next to contextLabel, e.g. a record name. */
  @Input() context?: string | null;
  /** Subtitle shown instead of the chip when context is empty. */
  @Input() contextEmptyText?: string;
  /** id of the <form> projected into the body; wired to the footer's submit button. */
  @Input() formId = '';
  @Input() invalid = false;
  @Input() invalidText = 'Fix the highlighted fields';
  @Input() cancelLabel = 'Cancel';
  @Input() submitLabel = 'Save';
  @Input() savingLabel = 'Saving...';
  @Input() submitIcon?: string = 'plus';
  @Input() saving = false;
  @Input() showShortcutHint = true;
  @Input() submitShortcutVerb = 'submit';

  @Output() closed = new EventEmitter<void>();

  /**
   * Ctrl/Cmd + Enter submits the projected form, matching the footer hint. Listens on the document so it works
   * wherever focus is while the modal is open (a dropdown panel, the backdrop, a button); the form's own
   * validation still decides whether it actually saves.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented) return;
    const form = this.formId ? document.getElementById(this.formId) as HTMLFormElement | null : null;
    if (!form) return;
    // A confirm dialog stacked on top owns the shortcut.
    if (document.querySelector('app-confirm-dialog')) return;
    e.preventDefault();
    if (!this.saving) form.requestSubmit();
  }

  get toneClasses(): string {
    return TONE_CLASSES[this.tone] ?? TONE_CLASSES.violet;
  }
}
