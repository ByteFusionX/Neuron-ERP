import { Component, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { Params } from '@angular/router';
import { SfOption } from 'src/app/shared/components/smart-form';
import { DataGridColumn, DataGridFilter } from 'src/app/shared/components/data-grid/data-grid.model';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';

export interface ReportFilterField {
  /** Key in the values object this control reads and writes. */
  key: string;
  label: string;
  type: 'select' | 'combobox' | 'date';
  options?: SfOption[];
  placeholder?: string;
}

/**
 * Flat report params. An option field holds one id or several comma-joined ids, and `<key>Not = '1'`
 * turns it into "is not". Date fields are `fromDate` / `toDate`.
 */
export type ReportFilterValues = Record<string, string | null>;

type Filter = Omit<DataGridFilter, 'id'>;

const DATE_KEY = 'date';
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map(String).filter(Boolean);

/** Reads a report's values from the URL, "is not" flags included. */
export function readReportValues(params: Params, fields: ReportFilterField[]): ReportFilterValues {
  const out: ReportFilterValues = {};
  for (const f of fields) {
    const v = ids(params[f.key]);
    out[f.key] = v.length ? v.join(',') : null;
    if (f.type !== 'date') out[f.key + 'Not'] = v.length && params[f.key + 'Not'] ? '1' : null;
  }
  return out;
}

/** True when `id` passes the report filter on `key` (no filter, a match, or a miss under "is not"). */
export function matchesReportValue(values: ReportFilterValues, key: string, id: unknown): boolean {
  const wanted = ids(values[key]);
  if (!wanted.length) return true;
  const hit = wanted.includes(String(id ?? ''));
  return values[key + 'Not'] ? !hit : hit;
}

/** Values the list pages understand: single "is" ids and dates only, since the lists take one id per filter. */
export function listParamsFrom(values: ReportFilterValues): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k.endsWith('Not')) continue;
    out[k] = v && !v.includes(',') && !values[k + 'Not'] ? v : null;
  }
  return out;
}

/**
 * The report filters, drawn as the grid's Filter button (same builder, operators and multi-pick as
 * the List tab). The host keeps flat values; this maps them to and from the bar's filters. Put the
 * applied-filter pills under the header with `<app-filter-pills [bar]="ref.bar">`.
 */
@Component({
  selector: 'app-report-filters',
  standalone: true,
  imports: [FilterBarComponent],
  template: `<app-filter-bar #bar [columns]="columns" [filters]="filters" (filtersChange)="onChange($event)"></app-filter-bar>`,
})
export class ReportFiltersComponent implements OnChanges {
  @Input({ required: true }) fields: ReportFilterField[] = [];
  @Input() values: ReportFilterValues = {};
  /** Label of the single date column the From / To fields fold into. */
  @Input() dateLabel = 'Date';
  @Output() valuesChange = new EventEmitter<ReportFilterValues>();

  @ViewChild('bar', { static: true }) bar!: FilterBarComponent;

  columns: DataGridColumn[] = [];
  filters: Filter[] = [];

  ngOnChanges(): void {
    const optionFields = this.fields.filter((f) => f.type !== 'date');
    this.columns = [
      ...(this.fields.some((f) => f.type === 'date') ? [{ key: DATE_KEY, label: this.dateLabel, type: 'date' } as DataGridColumn] : []),
      ...optionFields.map((f) => ({ key: f.key, label: f.label, filterOptions: f.options || [] }) as DataGridColumn),
    ];

    const v = this.values || {};
    const filters: Filter[] = [];
    if (v['fromDate'] && v['fromDate'] === v['toDate']) filters.push({ key: DATE_KEY, op: 'on', value: v['fromDate'] });
    else {
      if (v['fromDate']) filters.push({ key: DATE_KEY, op: 'after', value: v['fromDate'] });
      if (v['toDate']) filters.push({ key: DATE_KEY, op: 'before', value: v['toDate'] });
    }
    for (const f of optionFields) {
      const vals = ids(v[f.key]);
      if (vals.length) filters.push({ key: f.key, op: v[f.key + 'Not'] ? 'isNot' : 'is', value: vals.length === 1 ? vals[0] : vals });
    }
    this.filters = filters;
  }

  onChange(filters: Filter[]): void {
    const out: ReportFilterValues = {};
    for (const f of this.fields) {
      if (f.type === 'date') { out[f.key] = null; continue; }
      const applied = filters.find((x) => x.key === f.key && (x.op === 'is' || x.op === 'isNot'));
      const vals = ids(applied?.value);
      out[f.key] = vals.length ? vals.join(',') : null;
      out[f.key + 'Not'] = vals.length && applied?.op === 'isNot' ? '1' : null;
    }
    const of = (op: string) => filters.find((x) => x.key === DATE_KEY && x.op === op)?.value;
    const on = ids(of('on')).sort();
    if (on.length) {
      // "is" on one or more days reads as the span they cover.
      out['fromDate'] = on[0];
      out['toDate'] = on[on.length - 1];
    } else {
      out['fromDate'] = of('after') || null;
      out['toDate'] = of('before') || null;
    }
    this.valuesChange.emit(out);
  }
}
