import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

@Component({
  selector: 'app-sf-slider',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfSliderComponent), multi: true }],
  template: `
    <div class="flex items-center gap-3">
      <input type="range" class="sf-focus h-1.5 flex-1 cursor-pointer accent-violet-600 disabled:cursor-not-allowed" [id]="inputId"
        [min]="min" [max]="max" [step]="stepSize" [value]="value ?? min" [disabled]="disabled || readonly"
        (input)="update(+$any($event.target).value)" (change)="touch()" />
      <span class="w-14 shrink-0 text-right text-[13px] font-medium tabular-nums text-gray-900 dark:text-gray-100">{{ value ?? min }}{{ suffix }}</span>
    </div>
    <div *ngIf="labels.length" class="mt-1 flex justify-between pr-[4.25rem] text-[11px] text-gray-400 dark:text-gray-500">
      <span *ngFor="let l of labels">{{ l }}</span>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfSliderComponent extends SfControl<number> {
  @Input() min = 0;
  @Input() max = 100;
  @Input() stepSize = 1;
  @Input() suffix = '';
  /** Evenly spaced captions under the track, e.g. ['Low', 'Medium', 'High'] */
  @Input() labels: string[] = [];
}
