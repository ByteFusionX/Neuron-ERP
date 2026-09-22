import { DetailMetric, DetailOverviewSection, DetailTableColumn } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';
import { DealCost, DealLine, dealTotals, marginFromPrice } from 'src/app/shared/utils/deal-pricing.util';

/** Everything the deal sheet renders, derived once from a quotation's `dealData`. */
export interface DealView {
  metrics: DetailMetric[];
  sections: DetailOverviewSection[];
  costRows: Record<string, any>[];
  /** Formatted selling price, for the list panel's summary. */
  sellingPrice: string;
}

/** Host-specific formatting, so the panel and the view page can share one builder. */
export interface DealViewFormat {
  number: (n: number) => string;
  date: (v: unknown) => string | null;
}

export const DEAL_COST_COLUMNS: DetailTableColumn[] = [
  { key: 'name', label: 'Description' },
  { key: 'type', label: 'Type' },
  { key: 'value', label: 'Amount', type: 'currency' },
];

export const DEAL_STATUS_TONES: Record<string, DetailTone> = { pending: 'warn', approved: 'good', rejected: 'bad', revoked: 'bad' };

export function hasDeal(quote: { dealData?: unknown } | null | undefined): boolean {
  return !!(quote?.dealData as any)?._id;
}

export function buildDealView(quote: { dealData?: any; currency?: string }, fmt: DealViewFormat): DealView {
  const deal = quote.dealData;
  const currency = quote.currency ?? '';
  const money = (n: number) => `${fmt.number(n)} ${currency}`.trim();

  const lines: DealLine[] = [];
  ((deal.updatedItems ?? []) as any[]).forEach((item) => (item.itemDetails ?? []).forEach((d: any) => {
    lines.push({ selected: !!d.dealSelected, quantity: d.quantity, unitCost: d.unitCost, unitSellingPrice: d.unitSellingPrice });
  }));

  const costs: DealCost[] = deal.additionalCosts ?? [];
  const totals = dealTotals(lines, costs);
  const profitTone: DetailTone = totals.profit < 0 ? 'bad' : 'good';
  const metrics: DetailMetric[] = [
    { label: 'Selling price', value: money(totals.sellingPrice) },
    { label: 'Total cost', value: money(totals.totalCost) },
    { label: 'Profit', value: money(totals.profit), tone: profitTone },
    { label: 'Margin', value: `${totals.marginPct.toFixed(2)}%`, tone: profitTone },
  ];

  const status = (deal.status ?? '').toLowerCase();
  const approver: any = deal.approvedBy;
  const approverName = approver && typeof approver === 'object' ? `${approver.firstName ?? ''} ${approver.lastName ?? ''}`.trim() : '';
  const comments = ((deal.comments ?? []) as string[]).filter(Boolean);
  const sections: DetailOverviewSection[] = [
    {
      title: 'Deal',
      columns: '2',
      fields: [
        { type: 'field', label: 'Deal Id', value: deal.dealId, numeric: true, noHover: true },
        { type: 'field', label: 'Status', value: status, pill: true, tone: DEAL_STATUS_TONES[status] ?? 'neutral', noHover: true },
        { type: 'field', label: 'Payment terms', value: deal.paymentTerms || '—', noHover: true },
        { type: 'field', label: 'Saved', value: fmt.date(deal.savedDate) ?? '—', noHover: true },
        { type: 'field', label: 'Approved by', value: approverName, noHover: true, visible: !!approverName },
      ],
    },
    {
      title: comments.length > 1 ? 'Review comments' : 'Review comment',
      visible: comments.length > 0,
      fields: comments.map((c, i) => ({ type: 'field' as const, label: comments.length > 1 ? `Comment ${i + 1}` : 'Comment', value: c, stacked: true, noHover: true })),
    },
  ];

  return {
    metrics, sections,
    sellingPrice: money(totals.sellingPrice),
    costRows: costs.map((c: any) => ({ name: c.name || '—', type: c.type, value: c.value })),
  };
}
