import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { SfOption } from 'src/app/shared/components/smart-form';

/**
 * One row offered under an item-name or description field.
 *
 * `CatalogueSuggestionSource` fills every field below from the product catalogue, stock included.
 * Another source (a different module's inventory view) can implement the same interface and return
 * `source: 'inventory'`; `applySuggestion` patches whatever a row carries and skips what it omits.
 */
export interface ItemSuggestion {
  /** The catalogue product's id — stored on the line as `productId`. */
  _id: string;
  categoryName: string;
  description: string;
  source: 'catalogue' | 'inventory';
  itemCode?: string;
  partNo?: string;
  uom?: string;
  unitCost?: number;
  unitSellingPrice?: number;
  supplierId?: string;
  /** Stock position at lookup time. Displayed on the row; never written to the line. */
  stockOnHand?: number;
  stockAvailable?: number;
  stockReserved?: number;
  stockQuarantined?: number;
  /** 'Service'/'Non-Stock Product' rows have no stock position to show. */
  productType?: string;
}

export interface ItemSuggestionQuery {
  /** What the user typed. */
  search: string;
  /** The item name the line sits under, when the search comes from a description field. */
  category?: string;
  /** Department/segment ids the host wants results narrowed to. */
  scopeIds: string[];
}

/**
 * How `app-item-entry` looks items up. Each module supplies its own (quotations reads the product
 * catalogue, another module might read inventory) so the component itself stays domain-free.
 */
export interface ItemSuggestionSource {
  search(query: ItemSuggestionQuery): Observable<ItemSuggestion[]>;
}

/** Module-level default. A host can also pass `[suggestionSource]` to override it per usage. */
export const ITEM_SUGGESTION_SOURCE = new InjectionToken<ItemSuggestionSource>('ITEM_SUGGESTION_SOURCE');

export interface ItemEntryTotals {
  totalCost: number;
  sellingPrice: number;
  totalProfit: number;
  discount: number;
}

/** Emitted when the user asks to create a catalogue entry from what they have typed. */
export interface CreateProductRequest {
  itemName: string;
  detail: string;
  scopeIds: string[];
}

/** The shape `app-item-entry` reads and writes. Matches the saved quotation payload. */
export interface ItemEntryLineValue {
  /** Set when the line was picked from a suggestion; links the saved line to its catalogue product. */
  productId?: string | { _id?: string } | null;
  itemCode?: string;
  partNo?: string;
  detail?: string;
  quantity?: number | null;
  unitCost?: number | null;
  profit?: number | null;
  unitSellingPrice?: number | null;
  availability?: string;
  supplierId?: string | { _id?: string } | null;
  uom?: string;
  /** Purchase mode only: the host's handle for mapping an edited line back to its saved record. */
  lineKey?: string | null;
}

export interface ItemEntryItemValue {
  itemName?: string;
  isOptional?: boolean;
  includeInTotal?: boolean;
  itemDetails?: ItemEntryLineValue[];
}

export interface ItemEntryOptionValue {
  items?: ItemEntryItemValue[];
  totalDiscount?: number | null;
}

export const DEFAULT_AVAILABILITY_OPTIONS: SfOption[] = [
  'Ex-Stock',
  'Ex-Stock (Subject to Prior Sale)',
  '2-3 Weeks',
  '4-6 Weeks',
  '6-8 Weeks',
].map((a) => ({ label: a, value: a }));
