import { Injectable, signal } from '@angular/core';
import type { ItemSuggestion } from 'src/app/shared/components/item-entry/item-entry.model';

/** What the RFQ drawer starts with when the command palette opens it. */
export interface RfqPreset {
  enquiryId: string;
  supplier?: { supplierId: string; supplierName: string; contactEmail?: string; isSupplierApproved?: boolean } | null;
  products: ItemSuggestion[];
}

/**
 * Carries a "start this for me" request from the command palette to the page that owns the flow.
 * The palette navigates there and the page takes (and clears) the request once it is ready.
 */
@Injectable({ providedIn: 'root' })
export class PaletteHandoffService {
  readonly rfq = signal<RfqPreset | null>(null);
  /** An existing supplier RFQ to open in its drawer. */
  readonly openRfqId = signal<string | null>(null);

  takeRfq(): RfqPreset | null {
    const preset = this.rfq();
    this.rfq.set(null);
    return preset;
  }
}
