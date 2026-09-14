import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusHistoryPopoverComponent } from './status-history-popover.component';
import { StatusHistoryEntry, STATUS_TONE_CLASSES, StatusTone, statusLabel, statusTone } from './status-tone';

export interface StatusStage {
  key: string;
  label?: string;
}

type StepState = 'done' | 'current' | 'upcoming' | 'failed';

/**
 * Horizontal stepper for multi-stage workflows (Enquiry → Presale → Quotation → Deal Sheet …).
 * `current` is matched case-insensitively against stage keys/labels. If the current status is a
 * terminal failure (rejected/cancelled/lost) pass `failedAt` with the stage it failed on.
 * Clicking a completed/current step opens that stage's history (entries whose status matches the stage),
 * or the full history if nothing matches.
 *
 * <app-status-stepper [stages]="['Draft','Submitted','Approved','Ordered','Delivered']"
 *   [current]="lpo.status" [history]="lpo.statusHistory"></app-status-stepper>
 */
@Component({
  selector: 'app-status-stepper',
  standalone: true,
  imports: [CommonModule, StatusHistoryPopoverComponent],
  template: `
    <ol class="flex w-full items-start overflow-x-auto pb-1" role="list" aria-label="Progress">
      @for (s of normalized; track s.key; let i = $index; let last = $last) {
        @let st = state(i);
        <li class="relative flex min-w-[88px] flex-1 flex-col items-center" [attr.aria-current]="st === 'current' ? 'step' : null">
          @if (!last) {
            <span class="absolute left-1/2 top-3.5 h-0.5 w-full" aria-hidden="true"
              [ngClass]="i < currentIndex ? lineClass : 'bg-gray-200 dark:bg-gray-700'"></span>
          }
          <button type="button"
            class="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            [ngClass]="nodeClass(st)"
            [class.cursor-pointer]="st !== 'upcoming'"
            [class.cursor-default]="st === 'upcoming'"
            [disabled]="st === 'upcoming'"
            [attr.title]="st !== 'upcoming' ? 'View ' + s.label + ' history' : s.label"
            (click)="select(i, $event)">
            @switch (st) {
              @case ('done') {
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>
              }
              @case ('failed') {
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.58l4.3-4.3a1 1 0 111.4 1.42L11.42 10l4.3 4.3a1 1 0 01-1.42 1.4L10 11.42l-4.3 4.3a1 1 0 01-1.4-1.42L8.58 10l-4.3-4.3a1 1 0 010-1.4z" clip-rule="evenodd"/></svg>
              }
              @case ('current') { <span class="h-2 w-2 rounded-full bg-white"></span> }
              @default { {{ i + 1 }} }
            }
          </button>
          <span class="mt-1.5 px-1 text-center text-xs leading-tight"
            [ngClass]="st === 'upcoming' ? 'text-gray-400' : st === 'current' || st === 'failed' ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'">
            {{ s.label }}
          </span>
          @if (stageDate(s); as d) { <span class="text-[10px] text-gray-400">{{ d | date: 'dd MMM' }}</span> }
          @if (openIndex === i) {
            <app-status-history-popover class="absolute top-full z-50 mt-1"
              [ngClass]="i === 0 ? 'left-0' : last ? 'right-0' : 'left-1/2 -translate-x-1/2'"
              [history]="historyFor(s)" [toneMap]="toneMap"></app-status-history-popover>
          }
        </li>
      }
    </ol>
  `,
})
export class StatusStepperComponent {
  @Input() stages: (string | StatusStage)[] = [];
  @Input() current: unknown;
  /** Stage key where the workflow was rejected/cancelled; that step renders red and later steps stay upcoming. */
  @Input() failedAt?: string;
  @Input() history: StatusHistoryEntry[] = [];
  @Input() toneMap?: Record<string, StatusTone>;
  @Output() stageClick = new EventEmitter<StatusStage>();
  openIndex: number | null = null;

  constructor(private host: ElementRef<HTMLElement>) {}

  get normalized(): Required<StatusStage>[] {
    return this.stages.map(s => typeof s === 'string'
      ? { key: s, label: statusLabel(s) }
      : { key: s.key, label: s.label ?? statusLabel(s.key) });
  }

  private indexOf(v: unknown): number {
    if (v === null || v === undefined) return -1;
    const k = String(v).trim().toLowerCase();
    return this.normalized.findIndex(s => s.key.toLowerCase() === k || s.label.toLowerCase() === k);
  }

  get currentIndex(): number { return this.failedAt ? this.indexOf(this.failedAt) : this.indexOf(this.current); }

  /** The final stage reached counts as done (e.g. "Delivered" gets a check, not a dot). */
  state(i: number): StepState {
    const c = this.currentIndex;
    if (this.failedAt && i === c) return 'failed';
    if (i < c) return 'done';
    if (i === c) return c === this.normalized.length - 1 ? 'done' : 'current';
    return 'upcoming';
  }

  get lineClass() { return STATUS_TONE_CLASSES[this.failedAt ? 'danger' : 'progress'].line; }

  nodeClass(st: StepState): string {
    switch (st) {
      case 'done': return STATUS_TONE_CLASSES.success.solid;
      case 'failed': return STATUS_TONE_CLASSES.danger.solid + ' ring-4 ring-red-100';
      case 'current': {
        const tone = statusTone(this.current, this.toneMap);
        return STATUS_TONE_CLASSES[tone === 'neutral' || tone === 'success' ? 'progress' : tone].solid + ' ring-4 ring-violet-100';
      }
      default: return 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800';
    }
  }

  private matching(s: StatusStage & { label: string }) {
    const k = s.key.toLowerCase(), l = s.label.toLowerCase();
    return this.history.filter(h => { const v = String(h.status).toLowerCase(); return v === k || v === l; });
  }

  historyFor(s: Required<StatusStage>): StatusHistoryEntry[] {
    const m = this.matching(s);
    return m.length ? m : this.history;
  }

  stageDate(s: Required<StatusStage>) {
    const m = this.matching(s).filter(h => h.at);
    return m.length ? m[m.length - 1].at : null;
  }

  select(i: number, e: Event) {
    e.stopPropagation();
    if (this.state(i) === 'upcoming') return;
    this.stageClick.emit(this.normalized[i]);
    this.openIndex = this.openIndex === i ? null : i;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event) {
    if (this.openIndex !== null && !this.host.nativeElement.contains(e.target as Node)) this.openIndex = null;
  }

  @HostListener('document:keydown.escape')
  onEsc() { this.openIndex = null; }
}
