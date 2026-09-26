import {
  Component, ContentChild, ElementRef, EventEmitter, HostBinding, HostListener, Input, OnChanges,
  OnDestroy, Output, SimpleChanges, TemplateRef, booleanAttribute,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DataGridBreadcrumb, DataGridBulkAction, DataGridBulkActionEvent, DataGridCellEditEvent,
  DataGridColumn, DataGridDetailTab, DataGridFilter, DataGridFilterOperator, DataGridQuery, DataGridRowAction,
  DataGridRowActionEvent, DataGridSortState, DataGridToast, DataGridView,
} from './data-grid.model';
import { DataGridAutofocusDirective } from './data-grid-autofocus.directive';
import { STATUS_TONE_CLASSES, statusTone } from '../status-indicator/status-tone';
import { DetailPanelComponent } from '../detail-panel/detail-panel.component';
import { DetailPanelIconComponent } from '../detail-panel/detail-panel-icon.component';

interface DataGridPrefs {
  columns?: { key: string; visible: boolean }[];
  pageSize?: number;
  activeViewId?: string;
  customViews?: DataGridView[];
  density?: 'comfortable' | 'compact';
}

/**
 * Reusable table with saved views, search, filter builder, sorting, row selection,
 * bulk actions, row quick actions, column show/hide/reorder, sticky header, pagination, loading
 * skeletons, toasts and a slide-in detail panel with next/previous record navigation.
 *
 * Set `storageKey` (e.g. "enquiries") to remember column layout, page size, the active view and
 * user-saved views per module. Panel fields can be edited in place with <app-dg-field>.
 *
 * Detail panel content is projected with:
 *   <ng-template #detailTemplate let-row let-tab="tab"> ... </ng-template>
 * Optional panel slots (let-row): #detailActionsTemplate (top bar), #detailAsideTemplate (status),
 * #detailMetaTemplate (key facts strip), #detailFooterTemplate (bottom action bar).
 */
@Component({
  selector: 'app-data-grid',
  // A `title` input must not leak onto the host as a native browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink,DataGridAutofocusDirective, DetailPanelComponent, DetailPanelIconComponent, MatTooltipModule],
  templateUrl: './data-grid.component.html',
  styleUrls: ['./data-grid.component.css'],
})
export class DataGridComponent<T extends Record<string, any> = any> implements OnChanges, OnDestroy {
  @Input() data: T[] = [];
  @Input() columns: DataGridColumn<T>[] = [];
  @Input() title = '';
  @Input() subtitle = '';
  /** Parent pages shown before the title, e.g. [{ label: 'Home', link: '/' }]. The title is the current page. */
  @Input() breadcrumbs: DataGridBreadcrumb[] = [];
  @Input() rowKey = 'id';
  @Input() loading = false;
  @Input() selectable = true;
  @Input() bulkActions: DataGridBulkAction[] = [];
  @Input() rowActions: DataGridRowAction<T>[] = [];
  @Input() detailTabs: DataGridDetailTab[] = [];
  @Input() detailTitle: (row: T) => string = (row) => String(row[this.rowKey] ?? '');
  @Input() detailSubtitle?: (row: T) => string;
  /** Breadcrumb label in the detail panel's top bar; defaults to the grid title. */
  @Input() detailBreadcrumb = '';
  @Input() pageSizeOptions = [10, 25, 50];
  @Input() pageSize = 10;
  @Input() maxHeight = '600px';
  @Input() emptyMessage = 'No records found';
  /** When true, the grid stretches to fill its parent's height (parent must be sized, e.g. a flex child) and only the table body scrolls. `maxHeight` is ignored. */
  @Input() fillHeight = false;
  /** Hide the Filter / Sort / Columns toolbar buttons (for small tables). */
  @Input() showToolbarTools = true;
  /** When false, row click only emits rowOpen; no slide-in detail panel is shown. */
  @Input() showDetailPanel = true;
  /** Label of the primary "+ New" button; the button is hidden when empty. */
  @Input() createLabel = '';
  @Input() searchPlaceholder = 'Search…';
  /** Tabs above the grid, e.g. All / My enquiries / Overdue. The first one is active by default. */
  @Input() views: DataGridView<T>[] = [];
  /** Sync the active grid view tab into the current URL query string, e.g. `?view=pending`. */
  @Input({ transform: booleanAttribute }) syncViewWithUrl = true;
  /** Query-string key used when `syncViewWithUrl` is enabled. Override if a page already owns `view`. */
  @Input() viewUrlParam = 'view';
  /** Key for remembering columns, page size and views in this browser; nothing is stored when empty. */
  @Input() storageKey = '';
  /** Shows a skeleton in the detail panel body while the host loads the full record. */
  @Input() detailLoading = false;
  /** Row height; the user's choice is remembered with `storageKey`. */
  @Input() density: 'comfortable' | 'compact' = 'comfortable';
  /** Left-edge accent for rows that need attention (overdue, blocked) */
  @Input() rowAccent?: (row: T) => 'danger' | 'warning' | 'info' | null | undefined;
  /** Shows an Export button that downloads the filtered rows (visible columns) as .xlsx. Defaults to `<title>.xlsx`. */
  @Input({ transform: booleanAttribute }) exportable = false;
  @Input() exportFileName = '';
  /** When true, `data` is treated as already filtered/sorted/paginated by the host; search, filter, sort,
   *  view and page changes emit `queryChange` instead of being computed client-side. */
  @Input({ transform: booleanAttribute }) serverSide = false;
  /** Total row count for the current query, used for pagination when `serverSide` is true. */
  @Input() totalCount = 0;

  @HostBinding('class.dg-fill-height') get hostFillHeight(): boolean {
    return this.fillHeight;
  }

  @Output() cellEdit = new EventEmitter<DataGridCellEditEvent<T>>();
  @Output() bulkAction = new EventEmitter<DataGridBulkActionEvent<T>>();
  @Output() selectionChange = new EventEmitter<T[]>();
  @Output() rowOpen = new EventEmitter<T>();
  @Output() rowAction = new EventEmitter<DataGridRowActionEvent<T>>();
  @Output() create = new EventEmitter<void>();
  /** Fires when the user switches view; server-paged hosts reload their data here. */
  @Output() viewChange = new EventEmitter<DataGridView<T>>();
  /** Fires with the current search/filter/sort/page state whenever any of them change and `serverSide` is true. */
  @Output() queryChange = new EventEmitter<DataGridQuery>();

  @ContentChild('detailTemplate') detailTemplate?: TemplateRef<any>;
  @ContentChild('detailActionsTemplate') detailActionsTemplate?: TemplateRef<any>;
  @ContentChild('detailAsideTemplate') detailAsideTemplate?: TemplateRef<any>;
  @ContentChild('detailMetaTemplate') detailMetaTemplate?: TemplateRef<any>;
  @ContentChild('detailFooterTemplate') detailFooterTemplate?: TemplateRef<any>;

  sort: DataGridSortState = { key: null, direction: null };
  page = 1;
  selectedKeys = new Set<any>();
  columnMenuOpen = false;


  searchTerm = '';
  filters: DataGridFilter[] = [];
  filterMenuOpen = false;
  draftFilter: { key: string; op: DataGridFilterOperator; value: any; or?: boolean } = { key: '', op: 'contains', value: '' };
  /** Filter being edited from its pill; null while adding a new one. */
  editingFilterId: number | null = null;
  toasts: DataGridToast[] = [];
  private nextId = 1;

  activeRow: T | null = null;
  activeTab = '';

  activeViewId = '';
  customViews: DataGridView<T>[] = [];
  saveViewOpen = false;
  newViewName = '';
  dragKey: string | null = null;
  dragOverKey: string | null = null;
  private defaultColumns: { key: string; visible: boolean }[] = [];
  private prefs: DataGridPrefs | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  private routeSub: Subscription | null = null;
  private pendingRouteViewId: string | null = null;
  private applyingRouteView = false;

  constructor(
    private host: ElementRef<HTMLElement>,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      this.pendingRouteViewId = params.get(this.viewUrlParam);
      this.applyRouteViewIfAvailable();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.prefs) this.loadPrefs();
    if (changes['columns']) {
      this.columns.forEach((c) => (c.visible = c.visible ?? true));
      this.defaultColumns = this.columns.map((c) => ({ key: c.key, visible: !!c.visible }));
      if (this.prefs?.columns) this.applyColumnState(this.prefs.columns);
    }
    if ((changes['views'] || !this.activeViewId) && !this.allViews.some((v) => v.id === this.activeViewId)) {
      const stored = this.routeViewId ?? this.prefs?.activeViewId;
      const view = this.allViews.find((v) => v.id === stored) ?? this.allViews[0];
      if (view) this.applyView(view);
    }
    if (changes['viewUrlParam'] || changes['syncViewWithUrl']) {
      this.pendingRouteViewId = this.route.snapshot.queryParamMap.get(this.viewUrlParam);
    }
    if (changes['views'] || changes['viewUrlParam'] || changes['syncViewWithUrl']) {
      this.applyRouteViewIfAvailable();
    }
    if (changes['data']) {
      const keys = new Set(this.data.map((r) => r[this.rowKey]));
      this.selectedKeys.forEach((k) => { if (!keys.has(k)) this.selectedKeys.delete(k); });
      if (this.activeRow && !keys.has(this.activeRow[this.rowKey])) this.activeRow = null;
      if (this.page > this.totalPages) this.page = this.totalPages;
    }
    if (changes['detailTabs'] && this.detailTabs.length && !this.activeTab) {
      this.activeTab = this.detailTabs[0].id;
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  // ---- columns ----
  get visibleColumns(): DataGridColumn<T>[] {
    return this.columns.filter((c) => c.visible);
  }

  toggleColumn(col: DataGridColumn<T>): void {
    if (col.locked) return;
    if (col.visible && this.visibleColumns.length === 1) return;
    col.visible = !col.visible;
    this.savePrefs();
  }

  showAllColumns(): void {
    this.columns.forEach((c) => (c.visible = true));
    this.savePrefs();
  }

  resetColumns(): void {
    this.applyColumnState(this.defaultColumns);
    this.savePrefs();
  }

  moveColumnBy(col: DataGridColumn<T>, delta: number): void {
    const target = this.columns[this.columns.indexOf(col) + delta];
    if (target) this.moveColumn(col.key, target.key);
    this.savePrefs();
  }

  trackColumnKey(_index: number, col: DataGridColumn<T>): string {
    return col.key;
  }

  onColumnDragStart(col: DataGridColumn<T>, event: DragEvent): void {
    this.dragKey = col.key;
    event.dataTransfer?.setData('text/plain', col.key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onColumnDragOver(col: DataGridColumn<T>, event: DragEvent): void {
    if (!this.dragKey) return;
    event.preventDefault();
    // Do NOT reorder `columns` here: mutating the *ngFor source mid-drag moves the
    // actively-dragged DOM node, which aborts the browser's native drag session.
    this.dragOverKey = col.key !== this.dragKey ? col.key : null;
  }

  onColumnDrop(col: DataGridColumn<T>, event: DragEvent): void {
    event.preventDefault();
    if (this.dragKey && col.key !== this.dragKey) this.moveColumn(this.dragKey, col.key);
    this.dragOverKey = null;
  }

  onColumnDragEnd(): void {
    this.dragKey = null;
    this.dragOverKey = null;
    this.savePrefs();
  }

  private moveColumn(fromKey: string, toKey: string): void {
    const cols = [...this.columns];
    const from = cols.findIndex((c) => c.key === fromKey);
    const to = cols.findIndex((c) => c.key === toKey);
    if (from < 0 || to < 0) return;
    cols.splice(to, 0, cols.splice(from, 1)[0]);
    this.columns = cols;
  }

  /** Reorders and shows/hides columns to match a saved layout; columns missing from it go to the end. */
  private applyColumnState(state: { key: string; visible: boolean }[]): void {
    const order = new Map(state.map((c, i) => [c.key, i] as [string, number]));
    const visible = new Map(state.map((c) => [c.key, c.visible] as [string, boolean]));
    this.columns = [...this.columns].sort((a, b) => (order.get(a.key) ?? 1e6) - (order.get(b.key) ?? 1e6));
    this.columns.forEach((c) => { if (!c.locked && visible.has(c.key)) c.visible = visible.get(c.key); });
    if (!this.visibleColumns.length && this.columns[0]) this.columns[0].visible = true;
  }

  private get columnState(): { key: string; visible: boolean }[] {
    return this.columns.map((c) => ({ key: c.key, visible: !!c.visible }));
  }

  // ---- views ----
  get allViews(): DataGridView<T>[] {
    return [...this.views, ...this.customViews];
  }

  get activeView(): DataGridView<T> | undefined {
    return this.allViews.find((v) => v.id === this.activeViewId);
  }

  private basePredicate(view?: DataGridView<T>): ((row: T) => boolean) | undefined {
    if (!view) return undefined;
    return view.custom ? this.views.find((v) => v.id === view.baseViewId)?.predicate : view.predicate;
  }

  viewCount(view: DataGridView<T>): number {
    if (view.count != null) return view.count;
    const pred = this.basePredicate(view);
    const rows = pred ? this.data.filter(pred) : this.data;
    if (!view.custom) return rows.length;
    return rows.filter((r) => this.matchesSearch(r, view.searchTerm ?? '') && this.matchesFilters(r, view.filters ?? [])).length;
  }

  selectView(view: DataGridView<T>): void {
    if (view.id === this.activeViewId) return;
    this.applyView(view);
    this.selectedKeys.clear();
    this.emitSelection();
    this.savePrefs();
    this.updateViewUrl(view.id);
    this.viewChange.emit(view);
    this.emitQuery();
  }

  private get routeViewId(): string | null {
    return this.syncViewWithUrl ? this.pendingRouteViewId : null;
  }

  private applyRouteViewIfAvailable(): void {
    const id = this.routeViewId;
    if (!id || !this.allViews.length || id === this.activeViewId) return;
    const view = this.allViews.find((v) => v.id === id);
    if (!view) return;
    this.applyingRouteView = true;
    try {
      this.applyView(view);
      this.selectedKeys.clear();
      this.emitSelection();
      this.savePrefs();
      this.viewChange.emit(view);
      this.emitQuery();
    } finally {
      this.applyingRouteView = false;
    }
  }

  private updateViewUrl(viewId: string): void {
    if (!this.syncViewWithUrl || this.applyingRouteView) return;
    const current = this.route.snapshot.queryParamMap.get(this.viewUrlParam);
    if (current === viewId) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [this.viewUrlParam]: viewId },
      queryParamsHandling: 'merge',
    });
  }

  private applyView(view: DataGridView<T>): void {
    this.activeViewId = view.id;
    this.searchTerm = view.searchTerm ?? '';
    this.filters = (view.filters ?? []).map((f) => ({ ...f }));
    this.sort = view.sort ? { ...view.sort } : { key: null, direction: null };
    if (view.columns) this.applyColumnState(view.columns);
    this.page = 1;
  }

  /** Emits the current query state for server-paged hosts. No-op unless `serverSide` is true. */
  private emitQuery(): void {
    if (!this.serverSide) return;
    this.queryChange.emit({
      search: this.searchTerm,
      filters: this.filters,
      sort: this.sort,
      page: this.page,
      pageSize: this.pageSize,
      viewId: this.activeViewId,
    });
  }

  openSaveView(): void {
    this.newViewName = '';
    this.saveViewOpen = true;
  }

  saveCurrentView(): void {
    const label = this.newViewName.trim();
    if (!label) return;
    const active = this.activeView;
    const view: DataGridView<T> = {
      id: `custom-${Date.now()}`,
      label,
      custom: true,
      baseViewId: active?.custom ? active.baseViewId : active?.id,
      searchTerm: this.searchTerm,
      filters: this.filters.map((f) => ({ ...f })),
      sort: { ...this.sort },
      columns: this.columnState,
    };
    this.customViews = [...this.customViews, view];
    this.activeViewId = view.id;
    this.saveViewOpen = false;
    this.savePrefs();
    this.notify(`View "${label}" saved`);
  }

  deleteView(view: DataGridView<T>, event: Event): void {
    event.stopPropagation();
    this.customViews = this.customViews.filter((v) => v.id !== view.id);
    if (this.activeViewId === view.id) {
      const fallback = this.views.find((v) => v.id === view.baseViewId) ?? this.allViews[0];
      if (fallback) this.selectView(fallback);
      else { this.activeViewId = ''; this.clearFilters(); }
    }
    this.savePrefs();
    this.notify(`View "${view.label}" deleted`, 'info');
  }

  // ---- preferences ----
  private get prefsKey(): string {
    return this.storageKey ? `dg-prefs:${this.storageKey}` : '';
  }

  private loadPrefs(): void {
    this.prefs = {};
    if (!this.prefsKey) return;
    try {
      this.prefs = JSON.parse(localStorage.getItem(this.prefsKey) || '{}') as DataGridPrefs;
    } catch {
      this.prefs = {};
    }
    if (this.prefs.pageSize && this.pageSizeOptions.includes(this.prefs.pageSize)) this.pageSize = this.prefs.pageSize;
    this.customViews = (this.prefs.customViews ?? []) as DataGridView<T>[];
    if (this.prefs.density) this.density = this.prefs.density;
  }

  private savePrefs(): void {
    if (!this.prefsKey) return;
    this.prefs = {
      columns: this.columnState,
      pageSize: this.pageSize,
      activeViewId: this.activeViewId,
      customViews: this.customViews,
      density: this.density,
    };
    try {
      localStorage.setItem(this.prefsKey, JSON.stringify(this.prefs));
    } catch {
      // storage full or blocked: preferences just aren't remembered
    }
  }

  // ---- sorting ----
  toggleSort(col: DataGridColumn<T>): void {
    if (!col.sortable) return;
    if (this.sort.key !== col.key) this.sort = { key: col.key, direction: 'asc' };
    else if (this.sort.direction === 'asc') this.sort = { key: col.key, direction: 'desc' };
    else this.sort = { key: null, direction: null };
    this.page = 1;
    this.emitQuery();
  }

  // ---- sort menu & density ----
  sortMenuOpen = false;

  get sortableColumns(): DataGridColumn<T>[] {
    return this.columns.filter((c) => c.sortable);
  }

  get sortLabel(): string {
    return this.columns.find((c) => c.key === this.sort.key)?.label ?? '';
  }

  setSort(key: string | null, direction: 'asc' | 'desc' | null = null): void {
    const keep = this.sort.key === key ? this.sort.direction : null;
    this.sort = key ? { key, direction: direction ?? keep ?? 'asc' } : { key: null, direction: null };
    this.page = 1;
    this.emitQuery();
  }

  toggleDensity(): void {
    this.density = this.density === 'compact' ? 'comfortable' : 'compact';
    this.savePrefs();
  }

  get sortedData(): T[] {
    if (this.serverSide) return this.data;
    const { key, direction } = this.sort;
    const rows = this.filteredData;
    if (!key || !direction) return rows;
    const col = this.columns.find((c) => c.key === key);
    if (!col) return rows;
    const dir = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = this.rawValue(a, col);
      const vb = this.rawValue(b, col);
      if (va == null) return 1;
      if (vb == null) return -1;
      if (col.type === 'date') return (new Date(va).getTime() - new Date(vb).getTime()) * dir;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }

  // ---- search & filters ----
  get filteredData(): T[] {
    if (this.serverSide) return this.data;
    const pred = this.basePredicate(this.activeView);
    const rows = pred ? this.data.filter(pred) : this.data;
    if (!this.searchTerm.trim() && !this.filters.length) return rows;
    return rows.filter((row) => this.matchesSearch(row, this.searchTerm) && this.matchesFilters(row, this.filters));
  }

  private matchesSearch(row: T, term: string): boolean {
    const t = term.trim().toLowerCase();
    return !t || this.visibleColumns.some((c) => this.displayText(row, c).toLowerCase().includes(t));
  }

  get isFiltered(): boolean {
    return !!this.searchTerm.trim() || this.filters.length > 0;
  }

  /** Active view that narrows the rows (anything but the first/"All" tab), shown as a removable pill. */
  get scopedView(): DataGridView<T> | undefined {
    const v = this.activeView;
    return v && this.views.length && v.id !== this.views[0].id ? v : undefined;
  }

  clearView(): void {
    if (this.views.length) this.selectView(this.views[0]);
  }

  /** Numbers and currency right-align by default so magnitudes line up. */
  alignOf(c: DataGridColumn<T>): 'left' | 'center' | 'right' {
    return c.align ?? (c.type === 'number' || c.type === 'currency' ? 'right' : 'left');
  }

  get hasFooter(): boolean {
    return this.visibleColumns.some((c) => c.aggregate);
  }

  aggregateValue(c: DataGridColumn<T>): number | null {
    const nums = this.filteredData.map((r) => Number(this.rawValue(r, c))).filter((n) => !isNaN(n));
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return c.aggregate === 'avg' ? sum / nums.length : sum;
  }

  onSearch(term: string): void {
    this.searchTerm = term;
    this.page = 1;
    if (!this.serverSide) return;
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.emitQuery(), 300);
  }

  operatorsFor(col?: DataGridColumn<T>): { value: DataGridFilterOperator; label: string }[] {
    switch (col?.type) {
      case 'number':
      case 'currency':
        return [{ value: 'eq', label: 'equals' }, { value: 'gt', label: 'greater than' }, { value: 'lt', label: 'less than' }, { value: 'empty', label: 'is empty' }];
      case 'date':
        return [{ value: 'on', label: 'on' }, { value: 'before', label: 'before' }, { value: 'after', label: 'after' }, { value: 'empty', label: 'is empty' }];
      default:
        return this.optionsFor(col).length
          ? [{ value: 'is', label: 'is' }, { value: 'isNot', label: 'is not' }]
          : [{ value: 'contains', label: 'contains' }, { value: 'notContains', label: 'does not contain' }, { value: 'is', label: 'is' }, { value: 'empty', label: 'is empty' }];
    }
  }

  /** Discrete values for select-style filters (editor options, badge values). */
  optionsFor(col?: DataGridColumn<T>): { label: string; value: any }[] {
    if (!col) return [];
    if (col.editorOptions?.length) return col.editorOptions;
    if (col.type === 'badge') {
      const values = Array.from(new Set(this.data.map((r) => this.rawValue(r, col)).filter((v) => v != null)));
      return values.map((v) => ({ label: String(v), value: v }));
    }
    return [];
  }

  get draftColumn(): DataGridColumn<T> | undefined {
    return this.columns.find((c) => c.key === this.draftFilter.key);
  }

  toggleFilterMenu(): void {
    if (!this.filterMenuOpen) {
      const col = this.columns[0];
      this.editingFilterId = null;
      this.draftFilter = { key: col?.key ?? '', op: this.operatorsFor(col)[0].value, value: '' };
    }
    this.filterMenuOpen = !this.filterMenuOpen;
  }

  onDraftColumnChange(key: string): void {
    const col = this.columns.find((c) => c.key === key);
    this.draftFilter = { key, op: this.operatorsFor(col)[0].value, value: '', or: this.draftFilter.or };
  }

  get canApplyDraft(): boolean {
    const { key, op, value } = this.draftFilter;
    return !!key && (op === 'empty' || (value !== '' && value != null));
  }

  applyDraftFilter(): void {
    if (!this.canApplyDraft) return;
    if (this.editingFilterId != null) {
      const id = this.editingFilterId;
      this.filters = this.filters.map((f) => (f.id === id ? { ...f, ...this.draftFilter, or: f.or } : f));
    } else {
      this.filters = [...this.filters, { ...this.draftFilter, id: this.nextId++, or: this.filters.length ? !!this.draftFilter.or : undefined }];
    }
    this.editingFilterId = null;
    this.filterMenuOpen = false;
    this.page = 1;
    this.emitQuery();
  }

  /** Reopen the builder prefilled with a pill's condition. */
  editFilter(f: DataGridFilter): void {
    this.editingFilterId = f.id;
    this.draftFilter = { key: f.key, op: f.op, value: f.value, or: f.or };
    this.filterMenuOpen = true;
  }

  removeFilter(f: DataGridFilter): void {
    this.filters = this.filters.filter((x) => x.id !== f.id);
    if (this.filters.length) this.filters[0] = { ...this.filters[0], or: undefined };
    this.page = 1;
    this.emitQuery();
  }

  trackByGroupIndex(i: number): number {
    return i;
  }

  trackByFilterId(_: number, f: DataGridFilter): number {
    return f.id;
  }

  /** Flip the AND/OR connector between a filter and the one before it. */
  toggleConnector(f: DataGridFilter): void {
    this.filters = this.filters.map((x) => (x.id === f.id ? { ...x, or: !x.or } : x));
    this.page = 1;
    this.emitQuery();
  }

  /** Filters split into OR-groups, in order. Rows must match at least one filter of every group. */
  filterGroups(filters: DataGridFilter[] = this.filters): DataGridFilter[][] {
    const groups: DataGridFilter[][] = [];
    filters.forEach((f, i) => (i && f.or ? groups[groups.length - 1].push(f) : groups.push([f])));
    return groups;
  }

  private matchesFilters(row: T, filters: DataGridFilter[]): boolean {
    return this.filterGroups(filters).every((g) => g.some((f) => this.matchesFilter(row, f)));
  }

  clearFilters(): void {
    this.filters = [];
    this.searchTerm = '';
    this.page = 1;
    this.emitQuery();
  }

  /** True when search/filters differ from what the active view holds, so "Save view" makes sense. */
  get canSaveView(): boolean {
    const v = this.activeView;
    if (!this.isFiltered) return false;
    if (!v?.custom) return true;
    const strip = (fs: DataGridFilter[]) => JSON.stringify(fs.map(({ key, op, value, or }) => ({ key, op, value, or: !!or })));
    return (v.searchTerm ?? '') !== this.searchTerm || strip(v.filters ?? []) !== strip(this.filters);
  }

  filterLabel(f: DataGridFilter): { field: string; op: string; value: string } {
    const col = this.columns.find((c) => c.key === f.key);
    const op = this.operatorsFor(col).find((o) => o.value === f.op)?.label ?? f.op;
    let value = f.op === 'empty' ? '' : String(f.value);
    if (col?.type === 'date' && f.value) value = this.formatDate(f.value);
    const opt = this.optionsFor(col).find((o) => o.value === f.value);
    if (opt) value = opt.label;
    return { field: col?.label ?? f.key, op, value };
  }

  private matchesFilter(row: T, f: DataGridFilter): boolean {
    const col = this.columns.find((c) => c.key === f.key);
    if (!col) return true;
    const raw = this.rawValue(row, col);
    if (f.op === 'empty') return raw == null || raw === '';
    if (raw == null || raw === '') return f.op === 'isNot' || f.op === 'notContains';
    const text = String(raw).toLowerCase();
    const needle = String(f.value).toLowerCase();
    const day = () => new Date(raw).toISOString().slice(0, 10);
    switch (f.op) {
      case 'contains': return text.includes(needle);
      case 'notContains': return !text.includes(needle);
      case 'is': return text === needle;
      case 'isNot': return text !== needle;
      case 'eq': return Number(raw) === Number(f.value);
      case 'gt': return Number(raw) > Number(f.value);
      case 'lt': return Number(raw) < Number(f.value);
      case 'on': return day() === f.value;
      case 'before': return day() < f.value;
      case 'after': return day() > f.value;
    }
    return true;
  }

  private displayText(row: T, col: DataGridColumn<T>): string {
    const v = this.rawValue(row, col);
    if (v == null) return '';
    return col.type === 'date' ? this.formatDate(v) : String(v);
  }

  private formatDate(v: any): string {
    return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ---- toasts ----
  /** Show a transient confirmation. Hosts can call it through a template ref: grid.notify('Saved'). */
  notify(message: string, variant: DataGridToast['variant'] = 'success'): void {
    const toast: DataGridToast = { id: this.nextId++, message, variant };
    this.toasts = [...this.toasts, toast].slice(-4);
    setTimeout(() => this.dismissToast(toast), 3500);
  }

  dismissToast(toast: DataGridToast): void {
    this.toasts = this.toasts.filter((t) => t.id !== toast.id);
  }

  // ---- pagination ----
  get totalPages(): number {
    const total = this.serverSide ? this.totalCount : this.filteredData.length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  get pagedData(): T[] {
    if (this.serverSide) return this.data;
    const start = (this.page - 1) * this.pageSize;
    return this.sortedData.slice(start, start + this.pageSize);
  }

  get rangeStart(): number {
    const total = this.serverSide ? this.totalCount : this.filteredData.length;
    return total ? (this.page - 1) * this.pageSize + 1 : 0;
  }

  get rangeEnd(): number {
    const total = this.serverSide ? this.totalCount : this.filteredData.length;
    return Math.min(this.page * this.pageSize, total);
  }

  get pageNumbers(): (number | '…')[] {
    const total = this.totalPages;
    const cur = this.page;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '…')[] = [1];
    if (cur > 3) pages.push('…');
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
    if (cur < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }

  goTo(p: number | '…'): void {
    if (p === '…') return;
    this.page = Math.min(Math.max(1, p), this.totalPages);
    this.emitQuery();
  }

  changePageSize(size: number): void {
    this.pageSize = +size;
    this.page = 1;
    this.savePrefs();
    this.emitQuery();
  }

  // ---- loading ----
  get skeletonRows(): number[] {
    return Array.from({ length: Math.min(this.pageSize, 8) }, (_, i) => i);
  }

  /** Varied bar widths so the skeleton reads like real text rather than identical blocks. */
  skeletonWidth(col: DataGridColumn<T>, row: number, colIndex: number): string {
    switch (col.type) {
      case 'badge': return '4.5rem';
      case 'date': return '5.5rem';
      case 'number':
      case 'currency': return '4.5rem';
      default: return `${45 + ((row * 17 + colIndex * 29) % 45)}%`;
    }
  }

  // ---- selection ----
  isSelected(row: T): boolean {
    return this.selectedKeys.has(row[this.rowKey]);
  }

  toggleRow(row: T): void {
    const k = row[this.rowKey];
    if (this.selectedKeys.has(k)) this.selectedKeys.delete(k);
    else this.selectedKeys.add(k);
    this.emitSelection();
  }

  get pageAllSelected(): boolean {
    return this.pagedData.length > 0 && this.pagedData.every((r) => this.isSelected(r));
  }

  get pageSomeSelected(): boolean {
    return !this.pageAllSelected && this.pagedData.some((r) => this.isSelected(r));
  }

  togglePage(): void {
    const select = !this.pageAllSelected;
    this.pagedData.forEach((r) => {
      if (select) this.selectedKeys.add(r[this.rowKey]);
      else this.selectedKeys.delete(r[this.rowKey]);
    });
    this.emitSelection();
  }

  selectAll(): void {
    this.filteredData.forEach((r) => this.selectedKeys.add(r[this.rowKey]));
    this.emitSelection();
  }

  clearSelection(): void {
    this.selectedKeys.clear();
    this.emitSelection();
  }

  get selectedRows(): T[] {
    return this.data.filter((r) => this.selectedKeys.has(r[this.rowKey]));
  }

  runBulkAction(action: DataGridBulkAction): void {
    this.bulkAction.emit({ action, rows: this.selectedRows });
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selectedRows);
  }

  /** Shared by panel fields (<app-dg-field>): writes the value, emits cellEdit and confirms. */
  applyEdit(row: T, col: DataGridColumn<T>, value: any): void {
    const oldValue = row[col.key];
    let newValue = value;
    if (col.editor === 'number' || col.type === 'number' || col.type === 'currency') {
      newValue = newValue === '' || newValue == null ? null : Number(newValue);
    }
    if (newValue === oldValue || (col.editor === 'date' && newValue === this.editorValue(row, col))) return;
    (row as any)[col.key] = newValue;
    this.cellEdit.emit({ row, column: col, oldValue, newValue });
    this.notify(`${col.label} updated`);
  }

  /** Value in the shape an editor expects (dates as yyyy-mm-dd). */
  editorValue(row: T, col: DataGridColumn<T>): any {
    const v = row[col.key];
    return col.editor === 'date' && v ? new Date(v).toISOString().slice(0, 10) : v;
  }

  column(key: string): DataGridColumn<T> | undefined {
    return this.columns.find((c) => c.key === key);
  }

  // ---- detail panel ----
  openRow(row: T): void {
    this.activeRow = row;
    if (this.detailTabs.length && !this.detailTabs.some((t) => t.id === this.activeTab)) {
      this.activeTab = this.detailTabs[0].id;
    }
    this.rowOpen.emit(row);
  }

  closeDetail(): void {
    this.activeRow = null;
  }

  isActive(row: T): boolean {
    return !!this.activeRow && this.activeRow[this.rowKey] === row[this.rowKey];
  }

  /** Position of the open record in the list as the user sees it (view, search, filters, sort). */
  get activeIndex(): number {
    if (!this.activeRow) return -1;
    const key = this.activeRow[this.rowKey];
    return this.sortedData.findIndex((r) => r[this.rowKey] === key);
  }

  stepRow(delta: number): void {
    const idx = this.activeIndex;
    const target = this.sortedData[idx + delta];
    if (idx < 0 || !target) return;
    this.openRow(target);
    this.page = Math.floor((idx + delta) / this.pageSize) + 1;
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector(`tr[data-row-key="${CSS.escape(String(target[this.rowKey]))}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  @HostListener('document:keydown', ['$event'])
  onNavKey(event: KeyboardEvent): void {
    if (!this.activeRow || this.actionMenu || event.altKey || event.ctrlKey || event.metaKey) return;
    const t = event.target as HTMLElement | null;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    const delta = event.key === 'ArrowDown' || event.key === 'j' ? 1 : event.key === 'ArrowUp' || event.key === 'k' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    this.stepRow(delta);
  }

  // ---- row action menu ----
  actionMenu: { row: T; top: number; left: number } | null = null;

  openActionMenu(row: T, event: MouseEvent): void {
    event.stopPropagation();
    if (this.actionMenu && this.actionMenu.row[this.rowKey] === row[this.rowKey]) {
      this.actionMenu = null;
      return;
    }
    // fixed positioning so the menu isn't clipped by the scroll container
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = this.visibleRowActions(row).length * 36 + 12;
    const openUp = rect.bottom + menuHeight > window.innerHeight;
    this.actionMenu = {
      row,
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - menuWidth),
    };
  }

  closeActionMenu(): void {
    this.actionMenu = null;
  }

  visibleRowActions(row: T): DataGridRowAction<T>[] {
    return this.rowActions.filter((a) => !a.hidden?.(row));
  }

  get quickActionSlots(): DataGridRowAction<T>[] {
    return this.rowActions.filter((a) => a.quick);
  }

  /** Quick actions actually visible for this row — hidden ones are omitted rather than reserving a slot. */
  visibleQuickActionSlots(row: T): DataGridRowAction<T>[] {
    return this.quickActionSlots.filter((a) => !a.hidden?.(row));
  }

  /** Actions shown as icon buttons in the detail panel's top bar for the open record. */
  panelActions(row: T): DataGridRowAction<T>[] {
    // Opt-in only: everything else lives in the "More" menu so the header stays uncluttered.
    return this.rowActions.filter((a) => a.panel && !a.hidden?.(row));
  }

  isActionHidden(action: DataGridRowAction<T>, row: T): boolean {
    return !!action.hidden?.(row);
  }

  hasActionBadge(action: DataGridRowAction<T>, row: T): boolean {
    return !!action.badge?.(row);
  }

  runQuickAction(action: DataGridRowAction<T>, row: T): void {
    this.actionMenu = null;
    this.rowAction.emit({ action, row });
  }

  runRowAction(action: DataGridRowAction<T>): void {
    if (!this.actionMenu) return;
    const row = this.actionMenu.row;
    this.actionMenu = null;
    this.rowAction.emit({ action, row });
  }

  isMenuOpen(row: T): boolean {
    return !!this.actionMenu && this.actionMenu.row[this.rowKey] === row[this.rowKey];
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    this.actionMenu = null;
  }

  get colCount(): number {
    return this.visibleColumns.length + (this.selectable ? 1 : 0) + (this.rowActions.length ? 1 : 0);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.actionMenu) this.actionMenu = null;
    else if (this.filterMenuOpen) this.filterMenuOpen = false;
    else if (this.sortMenuOpen) this.sortMenuOpen = false;
    else if (this.saveViewOpen) this.saveViewOpen = false;
    else if (this.columnMenuOpen) this.columnMenuOpen = false;
    else this.closeDetail();
  }

  /** Downloads rows (default: all filtered rows) as .xlsx using the visible columns in their current order. */
  async exportToExcel(rows: T[] = this.filteredData): Promise<void> {
    if (!rows.length) {
      this.notify('Nothing to export', 'info');
      return;
    }
    const XLSX = await import('xlsx');
    const cols = this.visibleColumns;
    const sheetRows = rows.map((row) => {
      const out: Record<string, any> = {};
      cols.forEach((c) => {
        const v = this.rawValue(row, c);
        out[c.label] = c.type === 'date' && v ? new Date(v) : v ?? '';
      });
      return out;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows, { cellDates: true }), (this.title || 'Sheet1').slice(0, 31));
    XLSX.writeFile(wb, this.exportFileName || `${this.title || 'export'}.xlsx`);
    this.notify(`${rows.length} row${rows.length === 1 ? '' : 's'} exported`);
  }

  // ---- rendering helpers ----
  rawValue(row: T, col: DataGridColumn<T>): any {
    return col.valueGetter ? col.valueGetter(row) : row[col.key];
  }

  badgeText(col: DataGridColumn<T>, value: any): string {
    return col.badgeLabel ? col.badgeLabel(value) : value;
  }

  badgeClass(col: DataGridColumn<T>, value: any): string {
    return col.badgeClasses?.[value] ?? STATUS_TONE_CLASSES[statusTone(value)].pill + ' border';
  }

  trackRow = (_: number, row: T) => row[this.rowKey];
}
