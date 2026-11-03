import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { FormArray, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { CatalogueSuggestionSource, CreateProductRequest, ITEM_SUGGESTION_SOURCE, ItemEntryComponent, ItemEntryOptionValue } from 'src/app/shared/components/item-entry';
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
export class PrFormComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  canScrollLeft = false;
  canScrollRight = false;

  private stripEl?: HTMLElement;
  private stripResize?: ResizeObserver;
  private stripMutation?: MutationObserver;
  private stripFrame = 0;
  private destroyed = false;

  /** The tab strip lives under an *ngIf: watch its size and tabs once it exists (never read scroll in the template: NG0100). */
  @ViewChild('tabStrip') set tabStripRef(r: ElementRef<HTMLElement> | undefined) {
    const el = r?.nativeElement;
    if (el === this.stripEl) return;
    this.stripResize?.disconnect();
    this.stripMutation?.disconnect();
    this.stripEl = el;
    if (!el) return;
    this.stripResize = new ResizeObserver(() => this.scheduleStripUpdate());
    this.stripResize.observe(el);
    this.stripMutation = new MutationObserver(() => this.scheduleStripUpdate());
    this.stripMutation.observe(el, { childList: true, subtree: true, characterData: true });
    this.scheduleStripUpdate();
  }

  private scheduleStripUpdate(): void {
    if (this.stripFrame) return;
    this.stripFrame = requestAnimationFrame(() => {
      this.stripFrame = 0;
      this.updateStripScroll();
    });
  }

  /** Mouse wheel over the tab strip scrolls it sideways instead of the page. */
  onStripWheel(e: WheelEvent): void {
    const el = this.stripEl;
    if (!el || el.scrollWidth <= el.clientWidth || e.ctrlKey) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    const atStart = el.scrollLeft <= 0 && delta < 0;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && delta > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    el.scrollLeft += delta;
  }

  updateStripScroll(): void {
    const el = this.stripEl;
    if (!el || this.destroyed) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (left !== this.canScrollLeft || right !== this.canScrollRight) {
      this.canScrollLeft = left;
      this.canScrollRight = right;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.stripFrame);
    this.stripResize?.disconnect();
    this.stripMutation?.disconnect();
    clearTimeout(this.switchTimer);
    clearTimeout(this.endTimer);
  }

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
  @Input() lineHardLocked: (i: number, j: number, k: number) => boolean = () => false;
  @Input() lineAwarded: (line: any) => boolean = () => true;
  @Input() lineBadge: (i: number, j: number, k: number) => string | null = () => null;
  @Input() linePills: ((line: any) => { id: string; name: string }[]) | null = null;
  @Output() pillPicked = new EventEmitter<{ lineKey: string; supplierId: string; price: number | null }>();

  @Input() lineOffers: (line: any) => LineSupplierOffer[] = () => [];
  @Input() lineDeal: ((itemName: string, line: any) => { cost: number | null; supplierId: string | null } | null) | null = null;
  @Output() offerPicked = new EventEmitter<{ lineKey: string; offer: LineSupplierOffer }>();

  @Input() supplierTabs: { id: string; name: string; count: number; total?: number; closable?: boolean }[] = [];
  @Output() supplierClosed = new EventEmitter<string>();
  private _activeTab = 'items';
  /** What the tab bar highlights: flips on the click, before the (heavy) list re-render below runs. */
  shownTab = 'items';
  /** True from the click until the list has re-rendered: the list shows a skeleton meanwhile. */
  switching = false;
  private switchTimer?: ReturnType<typeof setTimeout>;
  private endTimer?: ReturnType<typeof setTimeout>;

  /** Highlight and skeleton paint first; the list switches one frame later so the click feels instant. */
  pickTab(id: string): void {
    if (id === this.shownTab) return;
    this.shownTab = id;
    this.switching = true;
    clearTimeout(this.switchTimer);
    clearTimeout(this.endTimer);
    this.switchTimer = setTimeout(() => {
      this.tabSelected.emit(id);
      // safety: never leave the skeleton up if the host ignored the switch
      this.endTimer = setTimeout(() => (this.switching = false), 600);
    }, 40);
  }

  @Input() set activeTab(v: string) {
    this._activeTab = v;
    this.shownTab = v;
    if (this.switching) {
      // the list re-renders in this change-detection pass; reveal it on the next tick
      clearTimeout(this.endTimer);
      this.endTimer = setTimeout(() => (this.switching = false), 0);
    }
  }
  get activeTab(): string { return this._activeTab; }
  readonly skeletonRows = [0, 1, 2, 3, 4];
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

  /** Ticked lines go into a supplier tab that already exists. */
  addToSupplier(supplierId: string): void {
    const keys = this.selectedKeys;
    if (!keys.length) return;
    this.supplierAdded.emit({ supplierId, lineKeys: keys });
    this.itemEntry?.clearSelection();
  }

  @Output() tabSelected =new EventEmitter<string>();
  /** A new supplier tab: the supplier and its lines. */
  @Output() supplierAdded = new EventEmitter<{ supplierId: string; lineKeys: string[] }>();
  /** Lines handed to the active supplier tab. */
  /** Lines ticked inside a supplier tab to add to it. */
  @Output() linesAddedToTab = new EventEmitter<string[]>();
  @Input() customerDiscountTotal = 0;
  @Input() dealExtraCosts = 0;
  @Input() jobTotals: { cost: number; price: number } | null = null;
  @Input() prExtraCosts = 0;
  @Input() dealSupplierDiscounts: { supplierId: any; discount?: number | string }[] | null = null;
  @Output() supplierDiscountEdited = new EventEmitter<{ supplierId: string; discount: number }>();
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
    return 'Prices entered. Award lines to suppliers in the next step';
  }

  @Output() jobLessChange = new EventEmitter<boolean>();
  @Output() jobSelected = new EventEmitter<string>();
  @Output() materialRequestsClicked = new EventEmitter<void>();
  /** Ticked lines to ask a supplier about, with the supplier picked in the selection bar if any. */
  @Output() createProductRequested = new EventEmitter<CreateProductRequest>();
  get f() {
    return this.purchaseForm.controls;
  }
}
