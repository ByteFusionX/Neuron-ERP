import { DetailTone } from './detail-tone';

export interface DetailOverviewField {
  /**
   * 'dg' reads label/value straight off a grid column via app-dg-field; 'field' renders a static
   * value you supply; 'badge' renders a standalone app-detail-badge; 'progress' renders an
   * app-detail-progress meter.
   */
  type: 'field' | 'dg' | 'badge' | 'progress';
  /** Grid column key; required for type 'dg'. */
  key?: string;
  /** Overrides the column label ('dg') or sets the label ('field'/'progress'). */
  label?: string;
  /** Value to display; used for type 'field' (display value) and 'progress' (percentage or raw figure against `max`). */
  value?: any;
  /** Right-aligns/tabular-nums the value, for ids and amounts. Only used for type 'field'. */
  numeric?: boolean;
  /** Renders the value as a status pill, using `tone`. Only used for type 'field'. */
  pill?: boolean;
  stacked?: boolean;
  noHover?: boolean;
  /** Highlights the value semantically. Used by 'field', 'badge' and 'progress'. */
  tone?: DetailTone;
  /** When false, the field is skipped entirely. Defaults to true. */
  visible?: boolean;
  /** type 'field' only: makes the value clickable to edit inline, like a 'dg' field. Defaults to false. */
  editable?: boolean;
  /** type 'field' + editable only: input kind shown while editing. Defaults to 'text'. */
  editor?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  /** type 'field' + editable only, editor 'select': options for the dropdown. */
  editorOptions?: { label: string; value: any }[];
  /** type 'field' + editable only: called with the new value on commit (Enter/blur/select change). */
  onSave?: (newValue: any) => void;
  /** type 'badge' only: adds a leading dot before the label. */
  dot?: boolean;
  /** type 'dg' only: renders a badge under the field's value, e.g. an overdue indicator. */
  badge?: { label: string; tone?: DetailTone; visible?: boolean; dot?: boolean };
  /** type 'progress' only: reads `value` against this instead of treating it as a 0-100 percentage. */
  max?: number;
  /** type 'progress' only: text on the right of the label row; pass '' to hide it. */
  display?: string | null;
  /** type 'progress' only: percentage position of the "planned" tick on the track. */
  marker?: number;
  /** type 'progress' only: muted line under the track. */
  caption?: string;
}

export interface DetailOverviewSection {
  title: string;
  columns?: '1' | '2';
  fields: DetailOverviewField[];
  /** When false, the section's emptyMessage is shown instead of the fields (e.g. no deal data yet). Defaults to true. */
  visible?: boolean;
  emptyMessage?: string;
}

export interface DetailPanelTab {
  id: string;
  label: string;
  /** Icon name from app-dp-icon, e.g. 'info', 'chat', 'files', 'activity', 'tasks', 'settings'. */
  icon?: string;
}

export interface DetailDocument {
  id: string;
  name: string;
  /** File extension shown in the tile, e.g. 'PDF'. Derived from the name when omitted. */
  kind?: string;
  size?: string;
  uploadedBy?: string;
  date?: string;
}

export interface DetailTableColumn {
  key: string;
  label: string;
  /** 'stack' renders `key` as a bold title with `subKey` as a muted second line. */
  type?: 'text' | 'number' | 'currency' | 'date' | 'badge' | 'html' | 'stack';
  align?: 'left' | 'right' | 'center';
  /** type 'stack' only: row field holding the muted second line (description, brand, model). */
  subKey?: string;
  /** type 'stack' only: clamps the second line to two lines. Defaults to false. */
  clamp?: boolean;
  /** Let long cell text wrap instead of staying on one line. */
  wrap?: boolean;
  /** Sum this column in the footer row. */
  total?: boolean;
  /** Row field holding the raw number to sum, when `key` holds a formatted string. */
  totalKey?: string;
  /** Angular number-pipe format for the footer total, e.g. '1.2-2'. */
  totalFormat?: string;
  /** Maps a badge cell's value to a semantic tone. Preferred over hand-written classes. */
  badgeTones?: Record<string, DetailTone>;
  /** Renders this column darker and semibold, for the figure the row is really about (e.g. Total Price). */
  emphasis?: boolean;
  /** CSS width for the column, e.g. '8rem'. Leave unset to size to content. */
  width?: string;
  /** Footer text for a column that isn't summed, e.g. a unit. Ignored when `total` is set. */
  totalLabel?: string;
}

/** One line of the <app-detail-table> summary card that can replace the plain footer row. */
export interface DetailSummaryRow {
  label: string;
  value: string | number;
  /** How to render `value`; 'text' (the default) prints it as-is. */
  format?: 'text' | 'currency' | 'number' | 'percent';
  /** Renders the line larger and darker, for the figure people are looking for (e.g. Grand Total). */
  emphasis?: boolean;
  /** Muted note under the label, e.g. "VAT 5%". */
  note?: string;
  tone?: DetailTone;
}

export interface DetailTaskItem {
  id: string;
  title: string;
  kind: 'task' | 'event';
  /** ISO date; for events this is when it happens. */
  date?: string;
  assignee?: string;
  done?: boolean;
  location?: string;
  /** Task urgency; not used for events. */
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  /** Whether this item can be removed via the `remove` output. Defaults to not showing a delete action. */
  deletable?: boolean;
  /** Optional file attachments shown under the item; each is removable via the `deleteFile` output. */
  attachments?: { id: string; name: string }[];
  description?: string;
  /** Events only: outcome. Anything other than 'pending' hides the success/cancel actions. */
  eventStatus?: 'pending' | 'completed' | 'success' | 'cancelled';
  /** Events only: whether the success/cancel actions are offered (via the `eventOutcome` output). */
  outcomeable?: boolean;
  status?: 'To do' | 'In progress' | 'Blocked';
  /** ISO date the work is planned to start. */
  startDate?: string;
  estimateHours?: number;
  watchers?: string[];
  tags?: string[];
  /** How long before the due date to remind the assignee, e.g. '1d'. */
  reminder?: string;
}

/** One cell of the key-facts strip under the panel header. */
export interface DetailMetaItem {
  label: string;
  value: string | number | null | undefined;
  /** How to render `value`; 'text' (the default) prints it as-is. */
  format?: 'text' | 'currency' | 'date' | 'percent';
  /** Highlights the value semantically, e.g. 'bad' for an overdue date. */
  tone?: DetailTone;
}

/** A button in the panel footer (or any <app-detail-actions> row). */
export interface DetailAction {
  /** Emitted by (action) when clicked. */
  id: string;
  label: string;
  /** Defaults to 'secondary'. */
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: string;
  /** Renders a router anchor instead of a button; such an action never emits (action). */
  link?: any[];
  disabled?: boolean;
}

/** One figure in an <app-detail-metrics> grid: a number plus the comparison that makes it mean something. */
export interface DetailMetric {
  label: string;
  value: string | number;
  tone?: DetailTone;
  /** 0-100; renders a track under the value when set. */
  bar?: number;
  /** 0-100 position of the "planned" tick on that track. */
  marker?: number;
  caption?: string;
}

/** One entry in an <app-detail-signal-list>: what needs attention, and why. */
export interface DetailSignal {
  id?: string;
  tone?: DetailTone;
  title: string;
  /** Muted identifier after the title, e.g. a record number. */
  ref?: string;
  /** Short toned line under the title, e.g. 'Over budget'. */
  label?: string;
  detail?: string;
  /** Right-aligned figure. */
  value?: string | number;
  /** Muted line under the value, e.g. an owner. */
  meta?: string;
}

/** One slice of an <app-detail-bar-mix> — the shape of a set as a single segmented bar. */
export interface DetailMixSegment {
  label: string;
  tone: DetailTone;
  /** 0-100 width of the slice. */
  share: number;
  /** Figure shown in the legend and the segment's tooltip. */
  count?: string | number;
}

/** One labelled bar in an <app-detail-breakdown>. */
export interface DetailBreakdownRow {
  label: string;
  /** Secondary text after the label, e.g. a count. */
  meta?: string | number;
  /** Right-aligned figure. */
  value?: string | number;
  /** 0-100 share of the total. Omit to render the row without a track. */
  share?: number;
  tone?: DetailTone;
}

/** One dot on an <app-detail-timeline>. */
export interface DetailTimelineEntry {
  text: string;
  /** Secondary line, e.g. "Sara Ali · 12 Mar 2026". */
  meta?: string;
  tone?: DetailTone;
  /** Field-level edits, rendered as label / before → after rows under the entry. */
  changes?: { label: string; from: string; to: string }[];
}

/** One step on an <app-detail-milestones> strip. */
export interface DetailMilestone {
  label: string;
  /** ISO date. */
  date: string;
  done: boolean;
}

/** One entry in an <app-detail-comments> thread. */
export interface DetailComment {
  text: string;
  by: string;
  /** ISO date. */
  date: string;
}

/** One row of an <app-detail-related-list>. */
export interface DetailRelatedItem {
  title: string;
  subtitle?: string;
  /** Right-aligned plain value, e.g. an amount. Ignored when `badge` is set. */
  meta?: string;
  /** Extra muted lines under the subtitle, e.g. "By Sara Ali", "12 Mar 2026". */
  lines?: string[];
  badge?: string;
  tone?: DetailTone;
  /** Router link; makes the row clickable. */
  link?: any[] | string;
  /** Query params sent with `link`. */
  queryParams?: Record<string, any>;
  /** No `link`, but the row is still clickable and emits (itemClick) — for navigation that needs router state. */
  clickable?: boolean;
  /** Passed back through (itemClick) so the parent can tell rows apart. */
  id?: string;
}

export interface DetailClause {
  id: string;
  title: string;
  body: string;
  /** Optional short label, e.g. "Payment" or "Warranty". */
  tag?: string;
}
