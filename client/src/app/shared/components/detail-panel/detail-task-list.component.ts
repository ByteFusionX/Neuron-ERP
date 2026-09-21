import { Component, EventEmitter, Input, OnInit, Output, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DetailTaskItem } from './detail-panel.model';
import { DetailPanelIconComponent } from './detail-panel-icon.component';

type Filter = 'all' | 'task' | 'event';

/**
 * Tasks and events for a detail panel tab: filter chips, completion progress, checkable tasks, dated events.
 *
 *   <app-detail-task-list [items]="items" addable (toggle)="..." (add)="..."></app-detail-task-list>
 */
@Component({
  selector: 'app-detail-task-list',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent, MatTooltipModule],
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div *ngIf="showTasks && showEvents" class="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="tablist">
        <button *ngFor="let f of filters" type="button" role="tab" [attr.aria-selected]="filter === f.id" (click)="filter = f.id"
          class="rounded-md px-2.5 py-1 text-xs font-medium transition"
          [ngClass]="filter === f.id ? 'bg-white text-gray-900 shadow-sm dark:bg-erp-surface-dark dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'">
          {{ f.label }} <span class="tabular-nums text-gray-400">{{ count(f.id) }}</span>
        </button>
      </div>
      <ng-container *ngIf="showEvents && filter === 'event'">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {{ eventTitle }} <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ count('event') }}</span>
        </p>
        <button *ngIf="addable" type="button" (click)="add.emit('event')"
          class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">
          <app-dp-icon name="plus" size="w-3.5 h-3.5"></app-dp-icon>Add event
        </button>
      </ng-container>
    </div>

    <!-- inline quick-add task input hidden for now, per-module tasks/events availability -->
    <div *ngIf="addable && showTasks && filter !== 'event'" class="mb-3 flex items-center gap-2">
      <button type="button" (click)="add.emit('task')" title="Add task with more detail"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">
        <app-dp-icon name="tasks" size="w-3.5 h-3.5"></app-dp-icon>Add task
      </button>
    </div>

    <div *ngIf="showTasks && taskCount && filter !== 'event'" class="mb-3">
      <div class="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{{ doneCount }} of {{ taskCount }} tasks done</span><span class="tabular-nums">{{ percent }}%</span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div class="h-full rounded-full bg-violet-600 transition-all" [style.width.%]="percent"></div>
      </div>
    </div>

    <ul *ngIf="visible.length; else empty" class="space-y-1.5">
      <li *ngFor="let i of visible; trackBy: trackById"
        class="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-erp-border-dark dark:bg-erp-surface-dark">
        <button *ngIf="i.kind === 'task'" type="button" role="checkbox" [attr.aria-checked]="!!i.done" [attr.aria-label]="i.title"
          (click)="toggle.emit(i)"
          class="mt-0.5 grid h-4 w-4 shrink-0 place-content-center rounded border transition"
          [ngClass]="i.done ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300 hover:border-violet-500 dark:border-gray-600'">
          <app-dp-icon *ngIf="i.done" name="check" size="w-3 h-3"></app-dp-icon>
        </button>
        <span *ngIf="i.kind === 'event'" class="mt-0.5 grid h-4 w-4 shrink-0 place-content-center text-sky-600 dark:text-sky-400">
          <app-dp-icon name="calendar" size="w-4 h-4"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px]" [ngClass]="i.done ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'">{{ i.title }}</p>
          <p class="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400">
            <span *ngIf="i.date" [class.text-red-600]="isOverdue(i)" class="tabular-nums">
              {{ i.date | date: (i.kind === 'event' ? 'EEE dd MMM, HH:mm' : 'dd MMM yyyy') }}{{ isOverdue(i) ? ' · overdue' : '' }}
            </span>
            <span *ngIf="i.assignee">{{ i.assignee }}</span>
            <span *ngIf="i.location">{{ i.location }}</span>
          </p>
          <p *ngIf="i.kind === 'event' && i.description" class="mt-1 whitespace-pre-line text-xs text-gray-600 dark:text-gray-300">{{ i.description }}</p>
          <span *ngIf="i.kind === 'event' && outcomeLabel(i)" class="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset"
            [ngClass]="outcomeClasses[i.eventStatus!]">
            <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>{{ outcomeLabel(i) }}
          </span>
          <span *ngIf="i.priority && !i.done" class="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset"
            [ngClass]="priorityClasses[i.priority]">
            <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>{{ i.priority }}
          </span>
          <div *ngIf="i.attachments?.length" class="mt-1.5 space-y-1">
            <div *ngFor="let f of i.attachments" class="flex items-center gap-1">
              <button type="button" (click)="previewFile.emit({ item: i, file: f })"
                class="flex items-center gap-1 truncate text-xs text-violet-600 hover:text-violet-800 hover:underline dark:text-violet-400">
                <app-dp-icon name="eye" size="w-3.5 h-3.5"></app-dp-icon>{{ f.name }}
              </button>
              <button type="button" (click)="deleteFile.emit({ item: i, file: f })" [attr.aria-label]="'Remove ' + f.name"
                class="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                <app-dp-icon name="close" size="w-3.5 h-3.5"></app-dp-icon>
              </button>
            </div>
          </div>
        </div>
        <ng-container *ngIf="i.kind === 'event' && i.outcomeable && (!i.eventStatus || i.eventStatus === 'pending')">
          <button type="button" (click)="eventOutcome.emit({ item: i, status: 'success' })" [attr.aria-label]="'Mark ' + i.title + ' successful'" matTooltip="Mark successful"
            class="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-md text-gray-400 opacity-0 transition hover:bg-emerald-50 hover:text-emerald-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400">
            <app-dp-icon name="check" size="w-3.5 h-3.5"></app-dp-icon>
          </button>
          <button type="button" (click)="eventOutcome.emit({ item: i, status: 'cancelled' })" [attr.aria-label]="'Cancel ' + i.title" matTooltip="Mark cancelled"
            class="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-md text-gray-400 opacity-0 transition hover:bg-amber-50 hover:text-amber-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-amber-950/40 dark:hover:text-amber-400">
            <app-dp-icon name="close" size="w-3.5 h-3.5"></app-dp-icon>
          </button>
        </ng-container>
        <button *ngIf="i.deletable" type="button" (click)="remove.emit(i)" [attr.aria-label]="'Delete ' + i.title" matTooltip="Delete"
          class="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-md text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400">
          <app-dp-icon name="trash" size="w-3.5 h-3.5"></app-dp-icon>
        </button>
      </li>
    </ul>

    <ng-template #empty>
      <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-erp-border-dark">
        <app-dp-icon name="tasks" size="w-6 h-6" class="text-gray-400"></app-dp-icon>
        <p class="text-[13px] text-gray-500 dark:text-gray-400">Nothing here yet.</p>
      </div>
    </ng-template>
  `,
  styles: [':host{display:block}'],
})
export class DetailTaskListComponent implements OnInit {
  @Input() items: DetailTaskItem[] = [];
  @Input({ transform: booleanAttribute }) addable = false;
  @Input() defaultFilter: Filter = 'all';
  /** Title shown next to the Add event button in the events tab. */
  @Input() eventTitle = 'Events';
  /** Whether this module tracks tasks. Modules that don't need tasks can disable it. */
  @Input({ transform: booleanAttribute }) showTasks = true;
  /** Whether this module tracks events. Modules that don't need events can disable it. */
  @Input({ transform: booleanAttribute }) showEvents = true;

  @Output() toggle = new EventEmitter<DetailTaskItem>();
  @Output() add = new EventEmitter<'task' | 'event'>();
  /** Emitted when a task is created via the inline quick-add input (title only, no dialog). */
  @Output() quickAdd = new EventEmitter<string>();
  @Output() remove = new EventEmitter<DetailTaskItem>();
  /** An event was marked successful or cancelled. Only offered on events with `outcomeable` still pending. */
  @Output() eventOutcome = new EventEmitter<{ item: DetailTaskItem; status: 'success' | 'cancelled' }>();
  @Output() previewFile = new EventEmitter<{ item: DetailTaskItem; file: { id: string; name: string } }>();
  @Output() deleteFile = new EventEmitter<{ item: DetailTaskItem; file: { id: string; name: string } }>();

  filter: Filter = 'all';

  readonly priorityClasses: Record<string, string> = {
    Low: 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700',
    Medium: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900',
    High: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900',
    Urgent: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900',
  };

  readonly outcomeClasses: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900',
    cancelled: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900',
  };

  outcomeLabel(i: DetailTaskItem): string {
    switch (i.eventStatus) {
      case 'completed': return 'Completed';
      case 'success': return 'Successful';
      case 'cancelled': return 'Cancelled';
      default: return '';
    }
  }

  ngOnInit(): void {
    if (this.showTasks && this.showEvents) this.filter = this.defaultFilter;
    else this.filter = this.showEvents ? 'event' : 'task';
  }

  readonly filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'task', label: 'Tasks' },
    { id: 'event', label: 'Events' },
  ];

  get visible(): DetailTaskItem[] {
    const list = this.filter === 'all' ? this.items : this.items.filter((i) => i.kind === this.filter);
    // open tasks first, then by date
    return [...list].sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.date ?? '').localeCompare(b.date ?? ''));
  }

  get taskCount(): number { return this.count('task'); }
  get doneCount(): number { return this.items.filter((i) => i.kind === 'task' && i.done).length; }
  get percent(): number { return this.taskCount ? Math.round((this.doneCount / this.taskCount) * 100) : 0; }

  count(f: Filter): number {
    return f === 'all' ? this.items.length : this.items.filter((i) => i.kind === f).length;
  }

  isOverdue(i: DetailTaskItem): boolean {
    return i.kind === 'task' && !i.done && !!i.date && new Date(i.date).getTime() < Date.now();
  }

  trackById = (_: number, i: DetailTaskItem) => i.id;
}
