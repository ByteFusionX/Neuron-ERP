import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

/** Step header for multi-step drawers. Steps are numbered from 1; `current` is the active one. */
@Component({
  selector: 'app-sf-stepper',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, NgIcon],
  template: `
    <ol class="mb-5 flex items-center gap-2">
      <li *ngFor="let label of labels; let i = index" class="flex flex-1 items-center gap-2">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="isLocked(idOf(i))"
          [ngClass]="current === idOf(i) ? 'bg-violet-50 dark:bg-violet-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
          (click)="stepClick.emit(idOf(i))">
          <span class="grid h-6 w-6 shrink-0 place-content-center rounded-full text-[11px] font-semibold"
            [ngClass]="current === idOf(i)
              ? 'bg-violet-600 text-white'
              : isDone(i)
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'">
            <ng-icon *ngIf="isDone(i); else stepNumber" name="heroCheck" class="h-3.5 w-3.5"></ng-icon>
            <ng-template #stepNumber>{{ i + 1 }}</ng-template>
          </span>
          <span class="truncate text-xs font-medium"
            [ngClass]="current === idOf(i) ? 'text-violet-700 dark:text-violet-300' : 'text-gray-600 dark:text-gray-400'">{{ label }}</span>
        </button>
        <span *ngIf="i < labels.length - 1" class="h-px w-4 shrink-0 bg-gray-200 dark:bg-erp-border-dark"></span>
      </li>
    </ol>
  `,
})
export class SfStepperComponent {
  @Input() labels: string[] = [];
  @Input() current = 1;
  /** Decides whether a finished step gets the green tick (e.g. only when its fields are valid). */
  @Input() isComplete: (step: number) => boolean = () => true;
  /** Step ids when they are not simply 1..n (e.g. a drawer that hides its first step). */
  @Input() ids: number[] = [];
  /** Locked steps are shown but can't be opened. */
  @Input() isLocked: (step: number) => boolean = () => false;
  /** Tick completed steps that come after the current one too, not only earlier ones. */
  @Input() tickAhead = false;
  @Output() stepClick = new EventEmitter<number>();

  idOf(i: number): number {
    return this.ids.length ? this.ids[i] : i + 1;
  }

  isDone(i: number): boolean {
    const id = this.idOf(i);
    return (this.tickAhead ? id !== this.current : id < this.current) && this.isComplete(id);
  }
}
