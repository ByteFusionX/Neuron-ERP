import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ItemSuggestion, ItemSuggestionQuery, ItemSuggestionSource } from './item-entry.model';

/** Maps a catalogue product (as the product endpoints return it) to an item-editor suggestion. */
export const toCatalogueSuggestion = (p: any): ItemSuggestion => ({
  _id: p._id,
  categoryName: p.productCategory?.categoryName || '',
  description: p.productDescription || '',
  productName: p.productName || '',
  source: 'catalogue',
  itemCode: p.itemCode || '',
  partNo: p.partNo || '',
  uom: p.unitOfMeasure || '',
  unitCost: p.estimatedCost ?? undefined,
  unitSellingPrice: p.defaultSellingPrice ?? undefined,
  supplierId: p.defaultVendor?._id || p.defaultVendor || undefined,
  stockOnHand: p.onHandQuantity ?? undefined,
  stockAvailable: p.availableQuantity ?? undefined,
  stockReserved: p.reservedQuantity ?? undefined,
  stockQuarantined: p.quarantinedQuantity ?? undefined,
  stockStatus: p.stockStatus || '',
  warehouseAvailability: p.warehouseAvailability || [],
  lastStockEntry: p.lastStockEntry || null,
  salesHistory: p.salesHistory || undefined,
  productType: p.type || '',
});

/**
 * Backs `app-item-entry`'s suggestions with the product catalogue.
 *
 * `/quotation/product-suggestions` already resolves each product's stock position (on hand, blocked,
 * reserved, quarantined) and its default pricing, so everything is mapped through here: the row both
 * autofills the line and shows live availability. This is also the seam for widening the sources —
 * another source implements the same interface and returns `source: 'inventory'` rows.
 */
@Injectable()
export class CatalogueSuggestionSource implements ItemSuggestionSource {
  /** Also offer products still awaiting approval (supplier RFQs skip product approval for now). */
  includePending = false;

  constructor(private _quotationService: QuotationService) {}

  search({ search, category, scopeIds }: ItemSuggestionQuery): Observable<ItemSuggestion[]> {
    return this._quotationService
      .getProductSuggestions({ search, departments: scopeIds, includePending: this.includePending, ...(category ? { category } : {}) })
      .pipe(map((res: any) => (res?.data || []).map(toCatalogueSuggestion)));
  }
}
