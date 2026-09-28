import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ItemSuggestion, ItemSuggestionQuery, ItemSuggestionSource } from './item-entry.model';

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
  constructor(private _quotationService: QuotationService) {}

  search({ search, category, scopeIds }: ItemSuggestionQuery): Observable<ItemSuggestion[]> {
    return this._quotationService
      .getProductSuggestions({ search, departments: scopeIds, ...(category ? { category } : {}) })
      .pipe(map((res: any) => (res?.data || []).map((p: any): ItemSuggestion => ({
        _id: p._id,
        categoryName: p.productCategory?.categoryName || '',
        description: p.productDescription || '',
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
        productType: p.type || '',
      }))));
  }
}
