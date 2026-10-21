import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
import { SalesRfqCompareColumn } from 'src/app/shared/interfaces/sales-rfq.interface';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ModalService } from 'src/app/shared/components/modal';
import { proratedRfqDiscount } from 'src/app/shared/utils/rfq-discount.util';
import { RfqCreateModalComponent, RfqModalData, RfqModalResult, RfqTabTerms } from './rfq-create-modal.component';

export type { RfqTabTerms };

@Component({
  selector: 'app-pr-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SmartFormModule,
    DetailBadgeComponent,
    ActionButtonComponent,
    ItemEntryComponent,
    NgIcon,
  ],
  templateUrl: './pr-form.component.html',
  styleUrl: './pr-form.component.css',
})
export class PrFormComponent {
  @Input({ required: true }) purchaseForm!: FormGroup;
  @Input({ required: true }) entryItems!: FormArray;
  @Input({ required: true }) sourceTitle = '';
  @Input({ required: true }) sourceSubtitle = '';
  @Input({ required: true }) jobOptions!: () => SfOption[];
  @Input({ required: true }) supplierOptions!: () => SfOption[];
  @Input({ required: true }) requestedJobId!: () => string;
  @Input({ required: true }) entrySeed!: () => ItemEntryOptionValue[];
  @Input({ required: true }) itemCount!: () => number;
  @Input({ required: true }) liveTotalLpo!: () => number;
  @Input({ required: true }) currency!: () => string;

  /** A general purchase has no supplier field: it is whoever wins the RFQs. */
  supplierName(): string {
    const id = this.purchaseForm.get('supplierId')?.value;
    return id ? (this.supplierOptions().find((o) => o.value === id)?.label ?? '') : '';
  }

  /** The host renders Add item itself (drawer footer), so the entry toolbar omits it. */
  @Input() externalAddButtons = false;
  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;

  @Input() isEditing = false;
  @Input() sourceLocked = false;
  /** The request can no longer change (sent for approval or later): lines, RFQs and terms are view-only. */
  @Input() readOnly = false;
  @Input() isJobLess = false;
  @Input() selectedJobSheet: unknown;
  @Input() lineLocked: (i: number, j: number, k: number) => boolean = () => false;
  @Input() lineAwarded: (line: any) => boolean = () => true;
  @Input() lineBadge: (i: number, j: number, k: number) => string | null = () => null;
  @Input() linePills: ((line: any) => { id: string; name: string }[]) | null = null;
  @Output() pillPicked = new EventEmitter<{ lineKey: string; supplierId: string; price: number | null }>();

  @Input() lineOffers: (line: any) => LineSupplierOffer[] = () => [];
  @Output() offerPicked = new EventEmitter<{ lineKey: string; offer: LineSupplierOffer }>();

  @Input() supplierTabs: { id: string; name: string; count: number; total?: number; closable?: boolean }[] = [];
  @Output() supplierClosed = new EventEmitter<string>();
  /** Each supplier's live RFQ, keyed by supplier id. */
  @Input() supplierRfqs: Record<string, SalesRfqCompareColumn> = {};
  @Input() activeTab = 'items';
  /** Drawer stepper: 'need' shows only the lines, 'ask' adds the supplier tabs and RFQ; null (route page) shows both. */
  @Input() stage: 'need' | 'ask' | null = null;
  /** Ask step counters: saved RFQs, lines no supplier was asked about, lines at the supplier limit. */
  @Input() askSummary: { rfqs: number; unasked: number; full: number } | null = null;
  readonly maxSuppliersPerLine = 5;

  get activeRfq(): SalesRfqCompareColumn | undefined {
    return this.supplierRfqs[this.activeTab];
  }
  /** Terms typed for each supplier tab that has no saved RFQ yet (or edited since). */
  @Input() tabTerms: Record<string, RfqTabTerms> = {};

  /** What the active tab's RFQ asks: edits made here win over what is saved. */
  get activeTerms(): RfqTabTerms | undefined {
    const saved = this.activeRfq;
    const local = this.tabTerms[this.activeTab];
    if (!saved && !local) return undefined;
    return { ...(saved?.requestedTerms ?? {}), deadline: saved?.deadline, ...(local ?? {}) };
  }

  private modal = inject(ModalService);

  /** Products ticked on the Items tab: the ones a new RFQ will ask about. */
  get selectedKeys(): string[] {
    return this.itemEntry?.selectedLineKeys() ?? [];
  }

  /** New RFQ for the ticked products, or (with a supplier id) the terms of that tab. */
  openRfqModal(supplierId: string | null = null): void {
    const taken = new Set(this.supplierTabs.map((t) => t.id));
    const keys = supplierId ? [] : this.selectedKeys;
    if (!supplierId && !keys.length) return;
    const data: RfqModalData = {
      supplierOptions: this.supplierOptions().filter((o) => !taken.has(String(o.value))),
      supplierName: supplierId ? this.activeTabName : undefined,
      terms: supplierId ? this.activeTerms : undefined,
      lineCount: keys.length,
    };
    this.modal.open<RfqModalResult, RfqModalData>(RfqCreateModalComponent, { width: '640px', data }).afterClosed().subscribe((res) => {
      if (!res) return;
      if (supplierId) {
        this.termsChanged.emit({ supplierId, terms: res.terms });
      } else if (res.supplierId) {
        this.supplierAdded.emit({ supplierId: res.supplierId, lineKeys: keys, terms: res.terms });
        this.itemEntry?.clearSelection();
      }
    });
  }

  /** Unsaved edits to a supplier's total discount, by RFQ id. */
  private discountDrafts: Record<string, { type: 'amount' | 'percent'; value: number }> = {};
  @Output() discountSaved = new EventEmitter<{ rfqId: string; type: 'amount' | 'percent'; value: number }>();

  discountDraft(r: SalesRfqCompareColumn): { type: 'amount' | 'percent'; value: number } {
    return this.discountDrafts[r._id] ?? { type: r.totalDiscountType || 'amount', value: r.totalDiscountValue || 0 };
  }

  setDiscountDraft(r: SalesRfqCompareColumn, patch: Partial<{ type: 'amount' | 'percent'; value: number }>): void {
    this.discountDrafts[r._id] = { ...this.discountDraft(r), ...patch };
  }

  discountDirty(r: SalesRfqCompareColumn): boolean {
    const d = this.discountDrafts[r._id];
    return !!d && (d.type !== (r.totalDiscountType || 'amount') || d.value !== (r.totalDiscountValue || 0));
  }

  saveDiscount(r: SalesRfqCompareColumn): void {
    const d = this.discountDraft(r);
    if (d.value < 0 || (d.type === 'percent' && d.value > 100)) return;
    this.discountSaved.emit({ rfqId: r._id, ...d });
    delete this.discountDrafts[r._id];
  }

  /** The saved discount on everything the supplier quoted. */
  savedDiscount(r: SalesRfqCompareColumn): number {
    return proratedRfqDiscount(r, r.quotedTotal || 0);
  }

  @Output() tabSelected = new EventEmitter<string>();
  @Output() termsChanged = new EventEmitter<{ supplierId: string; terms: RfqTabTerms }>();
  /** A new RFQ tab: the supplier, its lines and the terms asked of it. */
  @Output() supplierAdded = new EventEmitter<{ supplierId: string; lineKeys: string[]; terms?: RfqTabTerms }>();
  /** Lines handed to the active supplier tab. */
  /** Lines ticked inside a supplier tab to add to it. */
  @Output() linesAddedToTab = new EventEmitter<string[]>();
  @Input() tabLineKeys: string[] = [];
  @Input() tabExcludedKeys: string[] = [];
  @Output() linesRemovedFromTab = new EventEmitter<string[]>();
  @Output() linesAwardedToTab = new EventEmitter<{ lineKey: string; price: number; qty: number; total: number }[]>();

  get activeTabName(): string {
    return this.supplierTabs.find((t) => t.id === this.activeTab)?.name ?? '';
  }

  @Output() jobLessChange = new EventEmitter<boolean>();
  @Output() jobSelected = new EventEmitter<string>();
  @Output() materialRequestsClicked = new EventEmitter<void>();
  /** Ticked lines to ask a supplier about, with the supplier picked in the selection bar if any. */
  @Output() createProductRequested = new EventEmitter<void>();
  get f() {
    return this.purchaseForm.controls;
  }
}
