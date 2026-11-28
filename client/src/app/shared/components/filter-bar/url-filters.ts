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

/** True when the URL params of `spec` can hold this filter (one list value set, or a from/to/on date). */
function specCovers(f: Filter, spec: UrlFilterSpec[]): boolean {
  const s = spec.find((x) => x.key === f.key);
  if (!s) return false;
  return 'date' in s ? f.op === 'after' || f.op === 'before' || f.op === 'on' : f.op === 'is' || f.op === 'isNot';
}

/**
 * Grid filters for a list that shares params with its Report tab: filters the spec covers go to their
 * own params (the report reads those), everything else goes to one `filters` JSON param.
 */
export function listFiltersToParams(filters: Filter[], spec: UrlFilterSpec[]): Params {
  const covered: Filter[] = [];
  const rest: Filter[] = [];
  for (const f of filters) {
    const isDate = spec.some((s) => 'date' in s && s.key === f.key);
    // A param holds one filter per column (one per operator for the date column); extra chips go to the JSON.
    const taken = covered.some((c) => c.key === f.key && (!isDate || c.op === f.op));
    const clean: Filter = { key: f.key, op: f.op, value: f.value, ...(f.or ? { or: true } : {}) };
    (specCovers(f, spec) && !taken ? covered : rest).push(clean);
  }
  return { ...filtersToParams(covered, spec), filters: rest.length ? JSON.stringify(rest) : null };
}

/** Reverse of `listFiltersToParams`. */
export function listParamsToFilters(params: Params, spec: UrlFilterSpec[]): Filter[] {
  let rest: Filter[] = [];
  try {
    const parsed = params['filters'] ? JSON.parse(String(params['filters'])) : [];
    if (Array.isArray(parsed)) {
      rest = parsed
        .filter((f: any) => f && typeof f.key === 'string' && typeof f.op === 'string')
        .map((f: any) => ({ key: f.key, op: f.op, value: f.value, ...(f.or === true ? { or: true } : {}) }));
    }
  } catch {
    // A broken link just drops its extra filters.
  }
  return [...paramsToFilters(params, spec), ...rest];
}

/** One filter per picked value for the server: "is" values OR'd, "is not" AND'd, two "on" days a range (same as the grid). */
export function splitMultiValues(filters: Filter[]): Filter[] {
  return filters.flatMap((f) => {
    if (!Array.isArray(f.value)) return [f];
    if (f.op === 'on' && f.value.length === 2) return [{ ...f, op: 'between' as Filter['op'], value: [...f.value].sort() }];
    const anyOf = f.op === 'is' || f.op === 'on' || f.op === 'eq';
    return f.value.map((v: any, i: number) => ({ ...f, value: v, or: i === 0 ? f.or : anyOf }));
  });
}
