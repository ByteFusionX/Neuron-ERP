// Single source of truth for currencies on the client.
// DEFAULT_CURRENCY is only a last-resort fallback for records that carry no currency
// (e.g. legacy data). Documents always show the currency they were saved with.
export const DEFAULT_CURRENCY = 'QAR';
export const SUPPORTED_CURRENCIES = ['QAR', 'USD'] as const;
export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ label: c, value: c }));

/** Multiplier from one currency to another; rates are QAR per 1 USD. Null when a currency or the rate is unknown. */
export function currencyFactor(from: string, to: string, qarPerUsd: number | null | undefined): number | null {
  if (from === to) return 1;
  const rate = Number(qarPerUsd);
  if (!(rate > 0)) return null;
  const perQar: Record<string, number> = { QAR: 1, USD: 1 / rate };
  return perQar[from] && perQar[to] ? perQar[to] / perQar[from] : null;
}
