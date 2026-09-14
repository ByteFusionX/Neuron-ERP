import { Component, EventEmitter, HostListener, Input, Output, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Slide-over panel for create/edit forms. Project the form as content, header extras into [sfDrawerHeader]
 * and buttons into [sfDrawerFooter]. When `dirty`, closing asks to discard first.
 */
@Component({
  selector: 'app-sf-drawer',
  // A `title` input must not leak onto the host as a native browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sfd-backdrop fixed inset-0 z-[60] bg-gray-900/30 dark:bg-black/50" [class.sfd-open]="open" (click)="requestClose()"></div>
    <aside role="dialog" aria-modal="true" [attr.aria-label]="title" [attr.aria-hidden]="!open" [attr.inert]="open ? null : ''"
      class="sfd-panel fixed inset-y-0 right-0 z-[61] flex w-full flex-col bg-white dark:bg-erp-surface-dark shadow-2xl" [class.sfd-open]="open" [style.maxWidth]="width">
      <header class="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-100 dark:border-erp-border-dark px-5">
        <div class="min-w-0">
          <h2 class="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h2>
          <p *ngIf="subtitle" class="mt-0.5 text-xs text-gray-500 dark:text-gray-500">{{ subtitle }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <ng-content select="[sfDrawerHeader]"></ng-content>
          <button type="button" class="grid h-8 w-8 place-content-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
            aria-label="Close" (click)="requestClose()">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5"><ng-content></ng-content></div>

      <div *ngIf="confirming" class="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-6 py-2.5 text-[13px] text-amber-900 dark:text-amber-200" role="alert">
        <span>Discard unsaved changes?</span>
        <span class="flex gap-3">
          <button type="button" class="font-medium hover:underline" (click)="confirming = false">Keep editing</button>
          <button type="button" class="font-medium text-red-700 dark:text-red-400 hover:underline" (click)="forceClose(true)">Discard</button>
        </span>
      </div>

      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 dark:border-erp-border-dark bg-gray-50/70 dark:bg-gray-900/40 px-6 py-3">
        <ng-content select="[sfDrawerFooter]"></ng-content>
      </footer>
    </aside>
  `,
  styles: [`
    .sfd-backdrop { opacity: 0; pointer-events: none; transition: opacity 200ms ease; }
    .sfd-backdrop.sfd-open { opacity: 1; pointer-events: auto; }
    .sfd-panel { transform: translateX(100%); visibility: hidden; transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1), visibility 0s 250ms; }
    .sfd-panel.sfd-open { transform: none; visibility: visible; transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1); }
  `],
})
export class SfDrawerComponent {
  @Input({ transform: booleanAttribute }) open = false;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() width = '860px';
  @Input({ transform: booleanAttribute }) dirty = false;
  /** Emits true when the user confirmed discarding unsaved changes. */
  @Output() closed = new EventEmitter<boolean>();

  confirming = false;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.requestClose();
  }

  requestClose(): void {
    if (this.dirty && !this.confirming) this.confirming = true;
    else if (!this.dirty) this.forceClose(false);
  }

  forceClose(discarded: boolean): void {
    this.confirming = false;
    this.closed.emit(discarded);
  }
}
