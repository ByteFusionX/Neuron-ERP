import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusHistoryPopoverComponent } from './status-history-popover.component';
import { StatusHistoryEntry, STATUS_TONE_CLASSES, StatusTone, statusLabel, statusTone } from './status-tone';

/**
 * Color-coded status pill. Tone is inferred from the status text (approved → green,
 * rejected → red, pending → amber, …) and can be forced with `tone` or `toneMap`.
 * Pass `history` to make it clickable and show a timeline popover.
 *
 * <app-status-pill [status]="po.status" [history]="po.statusHistory"></app-status-pill>
 */
@Component({
  selector: 'app-status-pill',
  standalone: true,
  imports: [CommonModule, StatusHistoryPopoverComponent],
  template: `
    <span class="relative inline-flex">
      <button type="button"
        class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition"
        [ngClass]="[classes.pill, size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
                    clickable ? 'cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400' : 'cursor-default']"
        [attr.aria-haspopup]="clickable ? 'dialog' : null"
        [attr.aria-expanded]="clickable ? open : null"
        [attr.title]="clickable ? 'View status history' : null"
        [tabindex]="clickable ? 0 : -1"
        (click)="toggle($event)">
        <span class="h-1.5 w-1.5 rounded-full" [ngClass]="[classes.dot, pulse ? 'animate-pulse' : '']"></span>
        {{ label || displayLabel }}
        @if (clickable) {
          <svg class="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .27.14.52.37.64l3 1.75a.75.75 0 10.76-1.3l-2.63-1.52V5z" clip-rule="evenodd"/>
          </svg>
        }
      </button>
      @if (open) {
        <app-status-history-popover class="absolute left-0 top-full z-50 mt-1.5"
          [history]="history!" [toneMap]="toneMap"></app-status-history-popover>
      }
    </span>
  `,
})
export class StatusPillComponent {
  @Input() status: unknown;
  /** Override the displayed text (defaults to title-cased status). */
  @Input() label?: string;
  @Input() tone?: StatusTone;
  @Input() toneMap?: Record<string, StatusTone>;
  @Input() history?: StatusHistoryEntry[];
  @Input() size: 'sm' | 'md' = 'md';
  open = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  get resolvedTone(): StatusTone { return this.tone ?? statusTone(this.status, this.toneMap); }
  get classes() { return STATUS_TONE_CLASSES[this.resolvedTone]; }
  get displayLabel() { return statusLabel(this.status); }
  get clickable() { return !!this.history?.length; }
  /** Pulse the dot for statuses that need attention. */
  get pulse() { return this.resolvedTone === 'warning'; }

  toggle(e: Event) {
    if (!this.clickable) return;
    e.stopPropagation();
    this.open = !this.open;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event) {
    if (this.open && !this.host.nativeElement.contains(e.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.open = false; }
}
