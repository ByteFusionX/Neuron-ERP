import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES, SfOption } from './sf.model';

/** `list` for plain choices, `cards` when each option needs a description, `segmented` for 2-4 short options. */
@Component({
  selector: 'app-sf-radio-group',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfRadioGroupComponent), multi: true }],
  template: `
    <ng-container [ngSwitch]="variant">
      <div *ngSwitchCase="'segmented'" role="radiogroup" class="inline-flex max-w-full flex-wrap rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
        <button *ngFor="let o of options" type="button" role="radio" class="sf-focus h-8 rounded-md px-3 text-[13px] transition-colors"
          [attr.aria-checked]="o.value === value" [disabled]="disabled || readonly || o.disabled"
          [ngClass]="o.value === value ? 'bg-white dark:bg-gray-700 font-medium text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'"
          (click)="select(o)">{{ o.label }}</button>
      </div>

      <div *ngSwitchCase="'cards'" role="radiogroup" class="grid gap-2" [ngClass]="columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'">
        <label *ngFor="let o of options; let i = index" [attr.for]="inputId + '-' + i"
          class="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors"
          [ngClass]="o.value === value ? 'border-violet-500 dark:border-violet-500 bg-violet-50/50 dark:bg-violet-950/30 ring-1 ring-violet-500' : 'border-gray-200 dark:border-erp-border-dark hover:border-gray-300 dark:hover:border-gray-600'">
          <input type="radio" class="sf-radio" [name]="inputId" [id]="inputId + '-' + i" [checked]="o.value === value"
            [disabled]="disabled || readonly || o.disabled" (change)="select(o)" />
          <span class="min-w-0">
            <span class="block text-[13px] font-medium leading-5 text-gray-900 dark:text-gray-100">{{ o.label }}</span>
            <span *ngIf="o.description" class="block text-xs text-gray-500 dark:text-gray-500">{{ o.description }}</span>
          </span>
        </label>
      </div>

      <div *ngSwitchDefault role="radiogroup" class="flex flex-col gap-2">
        <label *ngFor="let o of options; let i = index" [attr.for]="inputId + '-' + i" class="inline-flex cursor-pointer select-none items-start gap-2.5">
          <input type="radio" class="sf-radio" [name]="inputId" [id]="inputId + '-' + i" [checked]="o.value === value"
            [disabled]="disabled || readonly || o.disabled" (change)="select(o)" />
          <span class="text-[13px] leading-5 text-gray-800 dark:text-gray-200">
            {{ o.label }}<span *ngIf="o.description" class="block text-xs text-gray-500 dark:text-gray-500">{{ o.description }}</span>
          </span>
        </label>
      </div>
    </ng-container>
  `,
  styles: [SF_STYLES],
})
export class SfRadioGroupComponent extends SfControl {
  @Input() options: SfOption[] = [];
  @Input() variant: 'list' | 'cards' | 'segmented' = 'list';
  @Input() columns: 1 | 2 | 3 = 1;

  select(o: SfOption): void {
    this.update(o.value);
    this.touch();
  }
}
