import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';

export interface FormStepperStep {
  n: number;
  label: string;
}

/** Numbered/checked-circle stepper header driving a multi-step form. */
@Component({
  selector: 'app-customer-form-stepper',
  standalone: true,
  imports: [NgFor, NgIf, NgClass, NgIcon],
  template: `
    <ol class="mb-5 flex items-center gap-2">
      <li *ngFor="let s of steps" class="flex flex-1 items-center gap-2">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
          [ngClass]="s.n === current ? 'bg-violet-50 dark:bg-violet-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
          (click)="stepClick.emit(s.n)">
          <span class="grid h-6 w-6 shrink-0 place-content-center rounded-full text-[11px] font-semibold"
            [ngClass]="s.n === current
              ? 'bg-violet-600 text-white'
              : (s.n < current && isStepValid(s.n))
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'">
            <ng-icon *ngIf="s.n < current && isStepValid(s.n); else stepNumber" name="heroCheck" class="h-3.5 w-3.5"></ng-icon>
            <ng-template #stepNumber>{{ s.n }}</ng-template>
          </span>
          <span class="truncate text-xs font-medium"
            [ngClass]="s.n === current ? 'text-violet-700 dark:text-violet-300' : 'text-gray-600 dark:text-gray-400'">{{ s.label }}</span>
        </button>
        <span *ngIf="s.n < steps.length" class="h-px w-4 shrink-0 bg-gray-200 dark:bg-erp-border-dark"></span>
      </li>
    </ol>
  `,
})
export class CustomerFormStepperComponent {
  @Input({ required: true }) steps: FormStepperStep[] = [];
  @Input({ required: true }) current = 1;
  @Input({ required: true }) isStepValid!: (n: any) => boolean;
  @Output() stepClick = new EventEmitter<number>();
}
