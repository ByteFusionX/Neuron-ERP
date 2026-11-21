import { Params } from '@angular/router';
import { DataGridFilter } from 'src/app/shared/components/data-grid/data-grid.model';

/**
 * How a module's grid filters live in the URL, shared by its List and Report pages so a filter set on
 * one carries over to the other. A list column maps to one param (plus `<param>Not=1` for "is not");
 * the date column maps to `fromDate` (after), `toDate` (before) and `onDates` (is, comma-separated).
 */
export type UrlFilterSpec = { key: string; param: string } | { key: string; date: true };

type Filter = Omit<DataGridFilter, 'id'>;

const list = (v: unknown): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map(String).filter(Boolean);

/** Every param the spec owns, so a navigation with `queryParamsHandling: 'merge'` also clears removed ones. */
export function filtersToParams(filters: Filter[], spec: UrlFilterSpec[]): Params {
  const out: Params = {};
  for (const s of spec) {
    if ('date' in s) {
      const of = (op: string) => filters.find((f) => f.key === s.key && f.op === op)?.value;
      out['fromDate'] = of('after') || null;
      out['toDate'] = of('before') || null;
      const on = list(of('on'));
      out['onDates'] = on.length ? on.join(',') : null;
    } else {
      const f = filters.find((x) => x.key === s.key && (x.op === 'is' || x.op === 'isNot'));
      const values = list(f?.value);
      out[s.param] = values.length ? (values.length === 1 ? values[0] : values) : null;
      out[s.param + 'Not'] = values.length && f?.op === 'isNot' ? '1' : null;
    }
  }
  return out;
}

export function paramsToFilters(params: Params, spec: UrlFilterSpec[]): Filter[] {
  const out: Filter[] = [];
  for (const s of spec) {
    if ('date' in s) {
      if (params['fromDate']) out.push({ key: s.key, op: 'after', value: params['fromDate'] });
      if (params['toDate']) out.push({ key: s.key, op: 'before', value: params['toDate'] });
      const on = list(params['onDates']);
      if (on.length) out.push({ key: s.key, op: 'on', value: on.length === 1 ? on[0] : on });
    } else {
      const values = list(params[s.param]);
      if (values.length) out.push({ key: s.key, op: params[s.param + 'Not'] ? 'isNot' : 'is', value: values.length === 1 ? values[0] : values });
    }
  }
  return out;
}
