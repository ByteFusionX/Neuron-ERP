import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { SfOption } from 'src/app/shared/components/smart-form';

/**
 * One row offered under an item-name or description field.
 *
 * The catalogue is today's only source (see `CatalogueSuggestionSource`). Inventory is the intended
 * second source: a source that returns `source: 'inventory'` rows may also fill `uom`, `unitCost`,
 * `supplierId` and `stockOnHand` — `applySuggestion` already patches those through, so nothing in
 * this component has to change when stock lookup lands.
 */
export interface ItemSuggestion {
  _id: string;
  categoryName: string;
  description: string;
  source: 'catalogue' | 'inventory';
  /** Populated by inventory sources only; unused until stock lookup exists. */
  uom?: string;
  unitCost?: number;
  supplierId?: string;
  stockOnHand?: number;
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
