export interface SalesDashboardFilters {
  from?: string | null;
  to?: string | null;
  compareFrom?: string | null;
  compareTo?: string | null;
  salesPerson?: string | null;
  customer?: string | null;
}

/** Per-employee layout and opening view, stored on the server. */
export interface DashboardPreferences {
  order: string[];
  hidden: string[];
  hiddenKpis: string[];
  defaults: { period: string | null; currency: string | null; person: string | null; customer: string | null };
}

export interface SalesPeriodKpis {
  enquiries: number;
  quotesCreated: number;
  quotesCreatedValue: number;
  quotesSent: number;
  quotesSentValue: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
  winRate: number | null;
  avgDeal: number | null;
  turnaround: number | null;
}

export interface SalesFunnelStep {
  key: string;
  label: string;
  count: number;
  value: number;
}

export interface SalesAttentionItem {
  id: string;
  ref: string;
  title: string;
  customer: string;
  owner: string;
  date: string | null;
  value: number | null;
  note: string;
  link: string[];
  query?: Record<string, string>;
}

export interface SalesAttentionGroup {
  key: string;
  label: string;
  hint: string;
  tone: 'red' | 'amber' | 'sky' | 'violet';
  icon: string;
  count: number;
  value: number;
  items: SalesAttentionItem[];
  viewAll: { link: string[]; query?: Record<string, string> };
}

export interface SalesPersonRow {
  id: string;
  name: string;
  enquiries: number;
  quotes: number;
  quotesValue: number;
  sent: number;
  won: number;
  wonValue: number;
  lost: number;
  pipeline: number;
  pipelineCount: number;
  winRate: number | null;
  turnaround: number | null;
  /** Customer discount given on quotes created in the period, and as % of their list price. */
  discount: number;
  discounted: number;
  discountPct: number | null;
}

export interface SalesConcentration {
  wonCustomers: number;
  top1Name: string | null;
  top1Share: number | null;
  top5Share: number | null;
  risk: 'none' | 'low' | 'medium' | 'high';
}

export interface SalesMarginRow {
  value: number;
  cost: number;
  margin: number;
  marginPct: number | null;
}

export interface SalesMargin extends SalesMarginRow {
  threshold: number;
  missingCost: number;
  products: (SalesMarginRow & { name: string; quotes: number })[];
  lowCount: number;
  low: { id: string; ref: string; customer: string; owner: string; status: string; value: number; margin: number; marginPct: number; link: string[] }[];
}

export interface SalesCustomerRow {
  id: string;
  name: string;
  quotes: number;
  quotesValue: number;
  won: number;
  wonValue: number;
  lost: number;
  pipeline: number;
  winRate: number | null;
  /** Share of all won revenue in the period. */
  share: number | null;
}

export interface SalesDashboard {
  generatedAt: string;
  usdToQar: number;
  period: { from: string; to: string; prevFrom: string; prevTo: string };
  scope: { label: string; canPickPerson: boolean };
  options: { people: { value: string; label: string }[]; customers: { value: string; label: string }[] };
  kpis: { current: SalesPeriodKpis; previous: SalesPeriodKpis; pipeline: { count: number; value: number } };
  funnel: SalesFunnelStep[];
  attention: SalesAttentionGroup[];
  trend: { months: string[]; enquiries: number[]; quoted: number[]; won: number[]; winRate: (number | null)[] };
  people: SalesPersonRow[];
  customers: SalesCustomerRow[];
  concentration: SalesConcentration;
  margin: SalesMargin;
  lostReasons: { reason: string; count: number; value: number; competitors: string[] }[];
  aging: { label: string; count: number; value: number }[];
  dealSizes: { label: string; won: number; lost: number; wonValue: number; winRate: number | null }[];
  sources: { label: string; enquiries: number; quoted: number; won: number }[];
}
