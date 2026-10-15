import { Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ItemSuggestion } from 'src/app/shared/components/item-entry/item-entry.model';

/** An item list open on screen that the command palette can add catalogue products to. */
export interface ItemEntryTarget {
  /** What the palette calls it: "Quotation", "Supplier RFQ", "Purchase request"... */
  label: string;
  /** Adds the products as lines; returns how many were added. */
  addProducts(products: ItemSuggestion[]): number;
  /** False while the list cannot take lines (its drawer closed, hidden, locked). */
  canAdd(): boolean;
  /** The supplier the list is currently being built for (Supplier RFQ: the selected tab), so the palette can suggest its products. */
  supplier?(): { supplierId: string; supplierName: string } | null;
  /** The item name/category the user has typed on the list, so the palette can suggest catalogue products under it. */
  itemHint?(): { name: string; search(): Observable<ItemSuggestion[]> } | null;
}

/**
 * Tracks the item editors currently on screen (quote drawer, RFQ drawer, purchase form...).
 * The most recently opened one is the target for the palette's "Add to ..." action, and its
 * presence also tells Ctrl+K to open the editor's own product search instead of the global one.
 */
@Injectable({ providedIn: 'root' })
export class ActiveItemEntryService {
  private stack: ItemEntryTarget[] = [];

  /** Drawers stay mounted while closed, so this is asked fresh each time rather than cached. */
  current(): ItemEntryTarget | null {
    for (let i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].canAdd()) return this.stack[i];
    return null;
  }

  register(target: ItemEntryTarget): () => void {
    this.stack.push(target);
    return () => (this.stack = this.stack.filter((t) => t !== target));
  }
}
