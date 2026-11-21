import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { DataGridColumn, DataGridFilter, DataGridFilterOperator } from 'src/app/shared/components/data-grid/data-grid.model';

/**
 * The data grid's Filter button, builder popover and applied-filter pills, on their own, for pages
 * that filter something other than a table (the module reports). Same columns, operators and value
 * lists as the grid, so a filter reads the same on the List and the Report tab.
 *
 * Hosts map filters to single request params, so filters are AND'd and "is" / "is not" can pick
 * several values in one filter (like a server-side grid with `multiValues`).
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, FormsModule, SmartFormModule],
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.css'],
})
export class FilterBarComponent {
  @Input({ required: true }) columns: DataGridColumn[] = [];
  @Input() set filters(value: Omit<DataGridFilter, 'id'>[] | null) {
    this.applied = (value ?? []).map((f) => ({ ...f, id: this.nextId++ }));
  }
  @Output() filtersChange = new EventEmitter<Omit<DataGridFilter, 'id'>[]>();

  applied: DataGridFilter[] = [];
  menuOpen = false;
  draft: { key: string; op: DataGridFilterOperator; value: any } = { key: '', op: 'is', value: '' };
  editingId: number | null = null;
  private nextId = 1;

  operatorsFor(col?: DataGridColumn): { value: DataGridFilterOperator; label: string }[] {
    switch (col?.type) {
      case 'number':
      case 'currency':
        return [{ value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }, { value: 'lt', label: 'less than' }, { value: 'gt', label: 'greater than' }];
      case 'date':
        return [{ value: 'on', label: 'is' }, { value: 'before', label: 'before' }, { value: 'after', label: 'after' }];
      default:
        return [{ value: 'is', label: 'is' }, { value: 'isNot', label: 'is not' }];
    }
  }

  optionsFor(col?: DataGridColumn): SfOption[] {
    return (col?.filterOptions?.length ? col.filterOptions : col?.editorOptions) ?? [];
  }

  get draftColumn(): DataGridColumn | undefined {
    return this.columns.find((c) => c.key === this.draft.key);
  }

  get draftUsesList(): boolean {
    return this.optionsFor(this.draftColumn).length > 0;
  }

  get draftMulti(): boolean {
    return this.draft.op === 'is' || this.draft.op === 'isNot';
  }

  get draftMultiDate(): boolean {
    return this.draftColumn?.type === 'date' && this.draft.op === 'on';
  }

  get draftDates(): string[] {
    const v = this.draft.value;
    return Array.isArray(v) ? v : v ? [v] : [];
  }

  addDraftDate(day: string | null): void {
    if (day && !this.draftDates.includes(day)) this.draft.value = [...this.draftDates, day].sort();
  }

  removeDraftDate(day: string): void {
    this.draft.value = this.draftDates.filter((d) => d !== day);
  }

  // Smart-form selects re-render when the array identity changes, so keep each list stable until its content does.
  private optionCache = new Map<string, { sig: string; out: SfOption[] }>();
  private cached(name: string, sig: string, build: () => SfOption[]): SfOption[] {
    const hit = this.optionCache.get(name);
    if (hit?.sig === sig) return hit.out;
    const out = build();
    this.optionCache.set(name, { sig, out });
    return out;
  }

  get columnSelectOptions(): SfOption[] {
    return this.cached('columns', this.columns.map((c) => c.key + c.label).join('|'), () => this.columns.map((c) => ({ label: c.label, value: c.key })));
  }

  get operatorSelectOptions(): SfOption[] {
    const ops = this.operatorsFor(this.draftColumn);
    return this.cached('ops', ops.map((o) => o.value).join('|'), () => ops.map((o) => ({ ...o, label: o.label.charAt(0).toUpperCase() + o.label.slice(1) })));
  }

  get valueSelectOptions(): SfOption[] {
    const opts = this.optionsFor(this.draftColumn);
    return this.cached('values:' + this.draft.key, opts.map((o) => o.value + ':' + o.label).join('|'), () => opts);
  }

  toggleMenu(): void {
    if (!this.menuOpen) {
      const col = this.columns[0];
      this.editingId = null;
      this.draft = { key: col?.key ?? '', op: this.operatorsFor(col)[0].value, value: '' };
    }
    this.menuOpen = !this.menuOpen;
  }

  onColumnChange(key: string | null): void {
    if (!key) return;
    this.draft = { key, op: this.operatorsFor(this.columns.find((c) => c.key === key))[0].value, value: '' };
  }

  onOpChange(op: DataGridFilterOperator): void {
    this.draft.op = op;
    const multiOp = op === 'is' || op === 'isNot' || (op === 'on' && this.draftColumn?.type === 'date');
    if (!multiOp && Array.isArray(this.draft.value)) this.draft.value = '';
  }

  get canApply(): boolean {
    const { key, value } = this.draft;
    if (Array.isArray(value)) return !!key && value.length > 0;
    return !!key && value !== '' && value != null;
  }

  apply(): void {
    if (!this.canApply) return;
    const draft = { ...this.draft };
    if (Array.isArray(draft.value) && draft.value.length === 1) draft.value = draft.value[0];
    if (this.editingId != null) {
      const id = this.editingId;
      this.applied = this.applied.map((f) => (f.id === id ? { ...f, ...draft } : f));
    } else {
      // One value per column and operator: a second one would override the first in the request.
      this.applied = [...this.applied.filter((f) => !(f.key === draft.key && f.op === draft.op)), { ...draft, id: this.nextId++ }];
    }
    this.editingId = null;
    this.menuOpen = false;
    this.emit();
  }

  edit(f: DataGridFilter): void {
    this.editingId = f.id;
    const multi = (f.op === 'is' || f.op === 'isNot') && this.optionsFor(this.columns.find((c) => c.key === f.key)).length > 0;
    this.draft = { key: f.key, op: f.op, value: multi && !Array.isArray(f.value) ? [f.value] : f.value };
    this.menuOpen = true;
  }

  remove(f: DataGridFilter): void {
    this.applied = this.applied.filter((x) => x.id !== f.id);
    this.emit();
  }

  clear(): void {
    this.applied = [];
    this.emit();
  }

  private emit(): void {
    this.filtersChange.emit(this.applied.map(({ key, op, value }) => ({ key, op, value })));
  }

  label(f: DataGridFilter): { field: string; op: string; value: string } {
    const col = this.columns.find((c) => c.key === f.key);
    const op = this.operatorsFor(col).find((o) => o.value === f.op)?.label ?? f.op;
    const options = this.optionsFor(col);
    const one = (v: any) => (col?.type === 'date' ? this.formatDate(v) : options.find((o) => o.value === v)?.label ?? String(v));
    return { field: col?.label ?? f.key, op, value: Array.isArray(f.value) ? f.value.map(one).join(', ') : one(f.value) };
  }

  formatDate(v: any): string {
    return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  trackById(_: number, f: DataGridFilter): number {
    return f.id;
  }
}
