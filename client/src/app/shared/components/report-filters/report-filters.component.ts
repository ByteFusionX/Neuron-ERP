import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

export interface ReportFilterField {
  /** Key in the values object this control reads and writes. */
  key: string;
  label: string;
  type: 'select' | 'combobox' | 'date';
  options?: SfOption[];
  placeholder?: string;
}

export type ReportFilterValues = Record<string, string | null>;

/**
 * A row of report filters driven by a field list. It only edits a copy of the values and emits the
 * new object; the host decides where they live (URL, store, ...) and when to refetch.
 */
@Component({
  selector: 'app-report-filters',
  standalone: true,
  imports: [NgFor, NgIf, NgSwitch, NgSwitchCase, FormsModule, SmartFormModule],
  templateUrl: './report-filters.component.html',
})
export class ReportFiltersComponent {
  @Input({ required: true }) fields: ReportFilterField[] = [];
  @Input() values: ReportFilterValues = {};
  @Input() hint = 'Showing a filtered slice of the data.';
  @Output() valuesChange = new EventEmitter<ReportFilterValues>();

  get hasFilters(): boolean {
    return this.fields.some((f) => !!this.values[f.key]);
  }

  set(key: string, value: string | null): void {
    this.valuesChange.emit({ ...this.values, [key]: value || null });
  }

  clear(): void {
    this.valuesChange.emit(Object.fromEntries(this.fields.map((f) => [f.key, null])));
  }
}
