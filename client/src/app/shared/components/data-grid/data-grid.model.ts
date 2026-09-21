export type DataGridCellType = 'text' | 'number' | 'currency' | 'date' | 'badge';
export type DataGridEditorType = 'text' | 'number' | 'select' | 'date';

export interface DataGridColumn<T = any> {
  key: string;
  label: string;
  type?: DataGridCellType;
  sortable?: boolean;
  visible?: boolean;
  /** Column cannot be hidden from the column menu */
  locked?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  editable?: boolean;
  editor?: DataGridEditorType;
  editorOptions?: { label: string; value: any }[];
  /** Map badge value -> tailwind classes */
  badgeClasses?: Record<string, string>;
  currencyCode?: string;
  /** Footer summary over the filtered rows. Numeric columns only. */
  aggregate?: 'sum' | 'avg';
  /** Extra classes for a body cell, e.g. red text for an overdue date */
  cellClass?: (row: T) => string | null | undefined;
  valueGetter?: (row: T) => any;
}

export interface DataGridBulkAction {
  id: string;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
}

export interface DataGridRowAction<T = any> {
  id: string;
  label: string;
  variant?: 'default' | 'danger';
  /** Draw a separator above this item */
  divider?: boolean;
  /** Hide the action for specific rows */
  hidden?: (row: T) => boolean;
  /** Also show as an icon button on row hover, so common actions skip the menu */
  quick?: boolean;
  /** app-dp-icon name used by the quick button */
  icon?: string;
  /** Show as an icon button in the detail panel's top bar for the open record. Defaults to `quick`. */
  panel?: boolean;
  /** Show a small attention dot on the quick button for rows where this returns true */
  badge?: (row: T) => boolean;
}

export interface DataGridRowActionEvent<T = any> {
  action: DataGridRowAction<T>;
  row: T;
}

export interface DataGridDetailTab {
  id: string;
  label: string;
  icon?: string;
}

export interface DataGridCellEditEvent<T = any> {
  row: T;
  column: DataGridColumn<T>;
  oldValue: any;
  newValue: any;
}

export interface DataGridBulkActionEvent<T = any> {
  action: DataGridBulkAction;
  rows: T[];
}

export interface DataGridSortState {
  key: string | null;
  direction: 'asc' | 'desc' | null;
}

export type DataGridFilterOperator =
  | 'contains' | 'notContains' | 'is' | 'isNot' | 'eq' | 'gt' | 'lt' | 'before' | 'after' | 'on' | 'empty';

export interface DataGridFilter {
  id: number;
  key: string;
  op: DataGridFilterOperator;
  value: any;
  /** OR'd with the filter before it. Consecutive OR'd filters form a group; groups are AND'd together. */
  or?: boolean;
}

/** Query state emitted by `queryChange` when the grid runs in server-side mode. */
export interface DataGridQuery {
  search: string;
  filters: DataGridFilter[];
  sort: DataGridSortState;
  page: number;
  pageSize: number;
  viewId: string;
}

export interface DataGridToast {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
}

/** One step in the trail above the grid title. Omit `link` for a non-navigable step. */
export interface DataGridBreadcrumb {
  label: string;
  link?: string | any[];
}

/**
 * A tab above the grid ("All", "My enquiries", "Overdue"). Built-in views come from the host; views the
 * user saves from the toolbar are `custom` and carry the search/filter/sort/column state they were saved with.
 */
export interface DataGridView<T = any> {
  id: string;
  label: string;
  /** Client-side rows of this view. Omit for "All", or when the host loads the view from the API. */
  predicate?: (row: T) => boolean;
  /** Count shown on the tab. Defaults to the predicate match count; pass it for server-paged modules. */
  count?: number;
  sort?: DataGridSortState;
  custom?: boolean;
  /** Built-in view a custom view was saved from; its predicate still applies. */
  baseViewId?: string;
  searchTerm?: string;
  filters?: DataGridFilter[];
  columns?: { key: string; visible: boolean }[];
}
