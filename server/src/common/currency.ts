// Single source of truth for currencies on the server.
// DEFAULT_CURRENCY is only a last-resort fallback for records that carry no currency
// (e.g. legacy data). Documents always keep the currency they were saved with.
export const DEFAULT_CURRENCY = 'QAR';
export const SUPPORTED_CURRENCIES = ['QAR', 'USD'] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export const isSupportedCurrency = (c: unknown): c is CurrencyCode =>
    SUPPORTED_CURRENCIES.includes(String(c ?? '').toUpperCase() as CurrencyCode);

/** Multiplier from one currency to another; rates are QAR per 1 USD. Null when a currency or the rate is unknown. */
export const currencyFactor = (from: string, to: string, qarPerUsd: number): number | null => {
  const f = String(from).toUpperCase();
  const t = String(to).toUpperCase();
  if (f === t) return 1;
  const rate = Number(qarPerUsd);
  if (!(rate > 0)) return null;
  const perQar: Record<string, number> = { QAR: 1, USD: 1 / rate };
  return perQar[f] && perQar[t] ? perQar[t] / perQar[f] : null;
};

/**
 * Once a deal sheet is saved it carries its own currency + rate (the quote stays as quoted).
 * Everything after the deal (job, PR, PO, delivery note, invoice) reads these, falling back to the quote.
 */
export const dealCurrencyOf = (quote: any): string | undefined => quote?.dealData?.currency || quote?.currency;
export const dealRateOf = (quote: any): number | undefined => {
  const d = quote?.dealData;
  if (d?.currency) return d.exchangeRate || undefined;
  return quote?.exchangeRate || undefined;
};
export const dealCurrencyStampFrom = (quote: any): { currency?: string; exchangeRate?: number; exchangeRateAt?: Date } =>
  quote?.dealData?.currency ? currencyStampFrom(quote.dealData) : currencyStampFrom(quote);

/** Currency + the rate saved with it, copied (never recomputed) from a source document. Legacy docs without a saved rate give currency only. */
export const currencyStampFrom = (src: any): { currency?: string; exchangeRate?: number; exchangeRateAt?: Date } => {
  if (!src?.currency) return {};
  const stamp: { currency?: string; exchangeRate?: number; exchangeRateAt?: Date } = { currency: src.currency };
  if (src.exchangeRate) {
    stamp.exchangeRate = src.exchangeRate;
    if (src.exchangeRateAt) stamp.exchangeRateAt = src.exchangeRateAt;
  }
  return stamp;
};
