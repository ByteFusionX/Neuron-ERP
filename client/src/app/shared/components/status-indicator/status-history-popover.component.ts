import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusHistoryEntry, STATUS_TONE_CLASSES, StatusTone, statusLabel, statusTone } from './status-tone';

/** Vertical timeline of status changes, newest first. Used inside pill/stepper popovers. */
@Component({
  selector: 'app-status-history-popover',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-72 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg dark:border-gray-700 dark:bg-gray-800"
      role="dialog" aria-label="Status history" (click)="$event.stopPropagation()">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Status history</p>
      @if (sorted.length) {
        <ol class="relative ml-1.5 border-l border-gray-200 dark:border-gray-700">
          @for (h of sorted; track $index; let first = $first) {
            <li class="mb-3 ml-4 last:mb-0">
              <span class="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-800"
                [ngClass]="dot(h.status)"></span>
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ label(h.status) }}
                @if (first) { <span class="ml-1 text-[10px] font-semibold uppercase text-violet-600">current</span> }
              </p>
              <p class="text-xs text-gray-500">
                {{ h.at ? (h.at | date: 'dd MMM yyyy, h:mm a') : '' }}{{ h.at && h.by ? ' · ' : '' }}{{ h.by }}
              </p>
              @if (h.comment) { <p class="mt-0.5 text-xs italic text-gray-600 dark:text-gray-300">“{{ h.comment }}”</p> }
            </li>
          }
        </ol>
      } @else {
        <p class="text-sm text-gray-500">No history recorded.</p>
      }
    </div>
  `,
})
export class StatusHistoryPopoverComponent {
  @Input() history: StatusHistoryEntry[] = [];
  @Input() toneMap?: Record<string, StatusTone>;

  get sorted(): StatusHistoryEntry[] {
    const hasDates = this.history.every(h => h.at);
    return hasDates
      ? [...this.history].sort((a, b) => new Date(b.at!).getTime() - new Date(a.at!).getTime())
      : [...this.history].reverse();
  }

  dot(s: string) { return STATUS_TONE_CLASSES[statusTone(s, this.toneMap)].dot; }
  label(s: string) { return statusLabel(s); }
}
