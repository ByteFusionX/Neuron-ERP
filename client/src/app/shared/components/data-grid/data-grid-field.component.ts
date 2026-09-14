import { Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { DataGridComponent } from './data-grid.component';
import { DataGridColumn } from './data-grid.model';
import { DataGridAutofocusDirective } from './data-grid-autofocus.directive';
import { DetailFieldComponent } from '../detail-panel/detail-field.component';
import { DetailPanelIconComponent } from '../detail-panel/detail-panel-icon.component';

/**
 * Detail panel field bound to a grid column. Editable columns can be changed in place: click the value,
 * then Enter / blur saves and Escape cancels. The change goes through the grid, so the host receives the
 * same (cellEdit) event as a table edit and the user sees the same confirmation.
 *
 *   <app-dg-field [grid]="grid" [row]="row" key="status" stacked></app-dg-field>
 */
@Component({
  selector: 'app-dg-field',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridAutofocusDirective, DetailFieldComponent, DetailPanelIconComponent],
  template: `
    <app-detail-field *ngIf="col" [label]="label || col.label" [icon]="icon" [stacked]="stacked">
      <ng-container *ngIf="editing; else display">
        <select *ngIf="col.editor === 'select'" class="dgf-input" dgAutofocus [ngModel]="value"
          (ngModelChange)="value = $event; commit()" (blur)="commit()" (keydown.escape)="cancel($event)">
          <option *ngFor="let o of col.editorOptions" [ngValue]="o.value">{{ o.label }}</option>
        </select>
        <input *ngIf="col.editor !== 'select'" class="dgf-input" dgAutofocus [(ngModel)]="value"
          [type]="col.editor === 'number' ? 'number' : col.editor === 'date' ? 'date' : 'text'"
          (keydown.enter)="commit()" (keydown.escape)="cancel($event)" (blur)="commit()" />
      </ng-container>

      <ng-template #display>
        <button *ngIf="col.editable; else readOnly" type="button" class="dgf-value group/dgf" (click)="start()"
          [attr.aria-label]="'Edit ' + (label || col.label)">
          <ng-container *ngTemplateOutlet="valueTpl"></ng-container>
          <app-dp-icon name="note" size="w-3.5 h-3.5" class="ml-auto text-gray-400 dark:text-gray-500 opacity-0 group-hover/dgf:opacity-100"></app-dp-icon>
        </button>
        <ng-template #readOnly><ng-container *ngTemplateOutlet="valueTpl"></ng-container></ng-template>
      </ng-template>

      <ng-template #valueTpl>
        <ng-container [ngSwitch]="col.type">
          <span *ngSwitchCase="'badge'" class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
            [ngClass]="grid.badgeClass(col, raw)">
            <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>{{ raw }}
          </span>
          <span *ngSwitchCase="'date'">{{ raw ? (raw | date: 'dd MMM yyyy') : '—' }}</span>
          <span *ngSwitchCase="'currency'" class="tabular-nums">{{ raw == null ? '—' : (raw | currency: (col.currencyCode || 'QAR') : 'symbol-narrow' : '1.2-2') }}</span>
          <span *ngSwitchCase="'number'" class="tabular-nums">{{ raw == null ? '—' : (raw | number) }}</span>
          <span *ngSwitchDefault>{{ raw ?? '—' }}</span>
        </ng-container>
      </ng-template>
    </app-detail-field>
  `,
  styles: [`
    .dgf-value { display: flex; align-items: center; gap: 0.5rem; width: calc(100% + 0.75rem); min-height: 1.875rem;
      margin: -0.25rem -0.375rem; padding: 0.25rem 0.375rem; border-radius: 0.375rem; text-align: left;
      transition: background-color 120ms ease; }
    .dgf-value:hover, .dgf-value:focus-visible { background: #f3f4f6; outline: none; }
    .dgf-input { width: 100%; height: 1.875rem; padding: 0 0.5rem; font-size: 0.8125rem; border: 1px solid #7c3aed;
      border-radius: 0.375rem; outline: none; box-shadow: 0 0 0 3px rgb(124 58 237 / 0.15); background: #fff; }
    :host-context(html.dark) .dgf-value:hover, :host-context(html.dark) .dgf-value:focus-visible { background: #2a2640; }
    :host-context(html.dark) .dgf-input { background: #1c1930; color: #f3f4f6; }
  `],
})
export class DataGridFieldComponent<T extends Record<string, any> = any> {
  @Input({ required: true }) grid!: DataGridComponent<T>;
  @Input({ required: true }) row!: T;
  /** Column key; the column may be hidden in the table. */
  @Input({ required: true }) key = '';
  /** Overrides the column label. */
  @Input() label = '';
  @Input() icon = '';
  @Input({ transform: booleanAttribute }) stacked = false;

  editing = false;
  value: any = null;

  get col(): DataGridColumn<T> | undefined {
    return this.grid?.column(this.key);
  }

  get raw(): any {
    return this.col ? this.grid.rawValue(this.row, this.col) : null;
  }

  start(): void {
    if (!this.col?.editable) return;
    this.value = this.grid.editorValue(this.row, this.col);
    this.editing = true;
  }

  commit(): void {
    if (!this.editing || !this.col) return;
    this.editing = false;
    this.grid.applyEdit(this.row, this.col, this.value);
  }

  cancel(event: Event): void {
    event.stopPropagation();
    this.editing = false;
  }
}
