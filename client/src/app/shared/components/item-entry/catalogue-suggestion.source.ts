import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ItemSuggestion, ItemSuggestionQuery, ItemSuggestionSource } from './item-entry.model';

/**
 * Backs `app-item-entry`'s suggestions with the product catalogue.
 *
 * This is the seam for widening the sources: an inventory-backed source would implement the same
 * interface and return `source: 'inventory'` rows carrying uom/unitCost/supplierId/stockOnHand.
 */
@Injectable()
export class CatalogueSuggestionSource implements ItemSuggestionSource {
  constructor(private _quotationService: QuotationService) {}

  search({ search, category, scopeIds }: ItemSuggestionQuery): Observable<ItemSuggestion[]> {
    return this._quotationService
      .getProductSuggestions({ search, departments: scopeIds, ...(category ? { category } : {}) })
      .pipe(map((res: any) => (res?.data || []).map((p: any): ItemSuggestion => ({
        _id: p._id,
        categoryName: p.productCategory?.categoryName || '',
        description: p.productDescription || '',
        source: 'catalogue',
      }))));
  }
}
