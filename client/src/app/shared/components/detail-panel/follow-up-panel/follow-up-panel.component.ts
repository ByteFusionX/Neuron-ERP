import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { DetailPanelIconComponent } from '../detail-panel-icon.component';
import { FollowUpViewModel } from '../../../utils/follow-up.util';

/**
 * Body of a "Follow-ups" detail tab: the open follow-up first, then what already happened.
 * The host owns the actions (schedule / log / cancel) so each module can call its own endpoints.
 */
@Component({
  selector: 'app-follow-up-panel',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, DetailPanelIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3">
      <div *ngIf="view.open as open" class="rounded-lg border p-3.5"
        [ngClass]="open.overdue ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20'">
        <div class="flex items-start justify-between gap-3">
          <span class="grid h-7 w-7 shrink-0 place-content-center rounded-md"
            [ngClass]="open.overdue ? 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400' : 'bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400'">
            <app-dp-icon [name]="open.overdue ? 'flag' : 'calendar'" size="w-4 h-4"></app-dp-icon>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Next follow-up</p>
            <p class="mt-0.5 text-[15px] font-semibold" [ngClass]="open.overdue ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">
              {{ open.due }}<span *ngIf="open.overdue" class="ml-2 text-xs font-medium">Overdue</span>
            </p>
            <p *ngIf="open.note" class="mt-1 text-xs text-gray-600 dark:text-gray-400">{{ open.note }}</p>
          </div>
          <button *ngIf="!readonly" type="button" (click)="cancel.emit()"
            class="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
        </div>
      </div>
      <div *ngFor="let f of view.history" class="rounded-lg border border-gray-200 bg-white p-3.5 dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <div class="flex items-start gap-2.5">
          <span class="grid h-7 w-7 shrink-0 place-content-center rounded-md"
            [ngClass]="f.status === 'cancelled' ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'">
            <app-dp-icon [name]="f.status === 'cancelled' ? 'close' : 'check'" size="w-4 h-4"></app-dp-icon>
          </span>
          <div class="min-w-0">
            <p class="text-[13px] font-medium" [ngClass]="f.status === 'cancelled' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'">{{ f.outcome }}</p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ f.date }}<ng-container *ngIf="f.createdByName"> · {{ f.createdByName }}</ng-container></p>
            <p *ngIf="f.note" class="mt-1 text-xs text-gray-600 dark:text-gray-400">{{ f.note }}</p>
          </div>
        </div>
      </div>
      <div *ngIf="!view.history.length && !view.open"
        class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-erp-border-dark">
        <app-dp-icon name="clock" size="w-6 h-6" class="text-gray-400"></app-dp-icon>
        <p class="text-[13px] text-gray-500 dark:text-gray-400">{{ closed ? 'No follow-ups were recorded.' : 'No follow-up is scheduled for this ' + subject + '.' }}</p>
      </div>
    </div>
  `,
})
export class FollowUpPanelComponent {
  @Input({ required: true }) view!: FollowUpViewModel;
  /** The record is finished (won, lost, expired, estimation done): nothing more to chase. */
  @Input() closed = false;
  /** Noun used in the empty message, e.g. "quotation". */
  @Input() subject = 'record';
  @Input() readonly = false;
  @Output() cancel = new EventEmitter<void>();
}
