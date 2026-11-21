import { UrlFilterSpec } from 'src/app/shared/components/filter-bar/url-filters';

/** Quotation grid filters as URL params; the List and Report tabs both read and write these. */
export const QUOTATION_URL_FILTERS: UrlFilterSpec[] = [
  { key: 'date', date: true },
  { key: 'customerName', param: 'customer' },
  { key: 'status', param: 'quoteStatus' },
  { key: 'dealStatus', param: 'dealStatus' },
  { key: 'salesPerson', param: 'salesPerson' },
  { key: 'department', param: 'department' },
];
