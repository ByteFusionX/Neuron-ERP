import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { CatalogueSuggestionSource, ITEM_SUGGESTION_SOURCE, ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
import { LineSupplierOffer } from 'src/app/shared/components/item-entry/item-entry.component';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';


@Component({
  selector: 'app-pr-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SmartFormModule,
    ActionButtonComponent,
    ItemEntryComponent,
    NgIcon,
  ],
  // Lines link to catalogue products: that link is the PR's partNo, and keys each supplier's last price.
  providers: [CatalogueSuggestionSource, { provide: ITEM_SUGGESTION_SOURCE, useExisting: CatalogueSuggestionSource }],
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
  @Input() lineDeal: ((itemName: string, line: any) => { cost: number | null; supplierId: string | null } | null) | null = null;
  @Output() offerPicked = new EventEmitter<{ lineKey: string; offer: LineSupplierOffer }>();

  @Input() supplierTabs: { id: string; name: string; count: number; total?: number; closable?: boolean }[] = [];
  @Output() supplierClosed = new EventEmitter<string>();
  @Input() activeTab = 'items';
  /** Drawer stepper: 'ask' adds the items-step hint above the supplier tabs; null (route page) leaves it out. */
  @Input() stage: 'ask' | null = null;
  /** Items step counter: lines with no supplier yet. */
  @Input() askSummary: { unasked: number } | null = null;

  /** Lines ticked on the Items tab: the ones the next supplier tab compares. */
  get selectedKeys(): string[] {
    return this.itemEntry?.selectedLineKeys() ?? [];
  }

  /** Supplier picked in the toolbar for the next comparison. */
  compareSupplierId = '';

  /** Suppliers without a tab yet. */
  get freeSuppliers(): SfOption[] {
    const taken = new Set(this.supplierTabs.map((t) => t.id));
    return this.supplierOptions().filter((o) => !taken.has(String(o.value)));
  }

  /** New supplier tab for the ticked lines and the picked supplier. */
  addCompare(): void {
    const keys = this.selectedKeys;
    if (!keys.length || !this.compareSupplierId) return;
    this.supplierAdded.emit({ supplierId: this.compareSupplierId, lineKeys: keys });
    this.compareSupplierId = '';
    this.itemEntry?.clearSelection();
  }

  @Output() tabSelected = new EventEmitter<string>();
  /** A new supplier tab: the supplier and its lines. */
  @Output() supplierAdded = new EventEmitter<{ supplierId: string; lineKeys: string[] }>();
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

  /** What the active supplier tab still needs: prices first, then picking who gets each line. */
  get tabHint(): string {
    const s = this.itemEntry?.scopePriceStatus(this.activeTab, this.tabLineKeys, this.tabExcludedKeys);
    if (!s?.lines) return 'Tick lines on Items and click Compare to add them here';
    if (s.priced < s.lines) return `${s.lines - s.priced} of ${s.lines} line${s.lines === 1 ? '' : 's'} need${s.lines - s.priced === 1 ? 's' : ''} a price`;
    return 'Prices entered. Award a line with its supplier pill, or tick lines and Assign';
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
