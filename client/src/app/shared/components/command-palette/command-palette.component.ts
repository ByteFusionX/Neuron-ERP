import { Component, DestroyRef, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { CommandPaletteService } from 'src/app/core/services/command-palette.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { LayoutService } from 'src/app/core/services/layout.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import { GlobalSearchService, SearchHit, SearchModule } from 'src/app/core/services/global-search.service';
import { ActiveItemEntryService, ItemEntryTarget } from 'src/app/core/services/active-item-entry.service';
import { PaletteHandoffService, RfqPreset } from 'src/app/core/services/palette-handoff.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { ItemSuggestion } from '../item-entry/item-entry.model';
import { toCatalogueSuggestion } from '../item-entry/catalogue-suggestion.source';
import { buildNavEntries } from '../../constants/nav-menu';

/** One line in the palette. Rows without `run` are information only and are skipped by the keyboard. */
interface PaletteRow {
  id: string;
  group: string;
  label: string;
  sub?: string;
  ref?: string;
  status?: string;
  icon: string;
  run?: () => void;
  /** Tickable product: goes into the basket. Without `run`, Enter ticks it too. */
  product?: ItemSuggestion;
  /** Tickable customer contact (emails copied in bulk). */
  contact?: { id: string; email: string };
  /** Opens the hit's detail view; shown with a chevron. */
  drill?: boolean;
  /** Emphasised action row. */
  primary?: boolean;
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; hit: SearchHit }
  /** Choosing the enquiry an RFQ is raised for; RFQs always belong to one. */
  | { kind: 'pickEnquiry'; supplier: RfqPreset['supplier']; products: ItemSuggestion[]; from: SearchHit | null };

const MODULE_META: Record<SearchModule, { label: string; one: string; icon: string }> = {
  supplier: { label: 'Suppliers', one: 'supplier', icon: 'heroBuildingOffice' },
  product: { label: 'Products', one: 'product', icon: 'heroCube' },
  customer: { label: 'Customers', one: 'customer', icon: 'heroUserGroup' },
  enquiry: { label: 'Enquiries', one: 'enquiry', icon: 'heroInboxArrowDown' },
  quotation: { label: 'Quotations', one: 'quotation', icon: 'heroDocumentText' },
  job: { label: 'Jobs', one: 'job', icon: 'heroBriefcase' },
  purchaseOrder: { label: 'Purchase orders', one: 'purchase order', icon: 'heroShoppingCart' },
  salesRfq: { label: 'Supplier RFQs', one: 'supplier RFQ', icon: 'heroScale' },
  employee: { label: 'Employees', one: 'employee', icon: 'heroUser' },
};

/** Hits with linked records worth a second screen; the rest open their page straight away. */
const DRILLABLE: SearchModule[] = ['supplier', 'product', 'customer', 'enquiry', 'quotation', 'job'];

/** Enquiries past these statuses cannot take new RFQs (same rule as the enquiry's RFQs tab). */
const CLOSED_ENQUIRY = ['quoted', 'lost'];

/**
 * The global command palette (Ctrl+K, or Ctrl+Shift+K inside an item list).
 *
 * List view: pages and actions (matched locally, instantly) plus records from every module (server
 * search, debounced). Enter on a supplier, product, customer, enquiry, quotation or job opens its
 * detail view: the record, its linked records across modules, and actions — tick a supplier's
 * products and raise an RFQ for them, add a product to the quotation/RFQ that is open on screen, etc.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [IconsModule],
  templateUrl: './command-palette.component.html',
})
export class CommandPaletteComponent {
  @ViewChild('queryInput') queryInput?: ElementRef<HTMLInputElement>;

  private search = inject(GlobalSearchService);
  private activeItemEntry = inject(ActiveItemEntryService);
  private handoff = inject(PaletteHandoffService);
  private quotationService = inject(QuotationService);
  private toaster = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  readonly query = signal('');
  readonly activeIndex = signal(0);
  readonly view = signal<View>({ kind: 'list' });

  readonly hits = signal<SearchHit[]>([]);
  readonly searching = signal(false);

  readonly related = signal<Record<string, any> | null>(null);
  readonly relatedLoading = signal(false);
  /** Product detail: the catalogue row with live stock, used for "add" actions. */
  readonly productSuggestion = signal<ItemSuggestion | null>(null);
  /** Ticked products from any view; survives searching and drilling until the palette closes. */
  readonly basket = signal<Map<string, ItemSuggestion>>(new Map());
  readonly emptyBasket = new Map<string, ItemSuggestion>();
  /** Customer detail: ticked contacts (id -> email). */
  readonly contacts = signal<Map<string, string>>(new Map());

  /** The item list open on screen when the palette opened (quotation, RFQ, purchase request). */
  readonly target = signal<ItemEntryTarget | null>(null);

  private readonly employee = toSignal(this._employeeService.employeeData$);
  private search$ = new Subject<{ q: string; modules?: SearchModule[] }>();

  private readonly navRows = computed<PaletteRow[]>(() => {
    const pages = buildNavEntries(this.employee()?.category.privileges).map((entry) => ({
      id: 'page:' + entry.route,
      group: 'Pages',
      label: entry.label,
      sub: entry.context,
      icon: entry.icon,
      run: () => this.go(entry.route),
    }));
    const actions: PaletteRow[] = [
      { id: 'action:profile', group: 'Actions', label: 'My profile', sub: 'Account', icon: 'heroUser', run: () => this.go('/profile') },
      { id: 'action:theme', group: 'Actions', label: 'Toggle dark mode', sub: 'Action', icon: 'heroMoon', run: () => this.close(() => this._theme.toggleTheme()) },
      { id: 'action:sidebar', group: 'Actions', label: 'Show / hide sidebar', sub: 'Action · Ctrl+B', icon: 'heroBars3', run: () => this.close(() => this._layout.toggleHidden()) },
    ];
    return [...pages, ...actions];
  });

  readonly placeholder = computed(() => {
    const v = this.view();
    if (v.kind === 'detail') return `Filter ${v.hit.title}…`;
    if (v.kind === 'pickEnquiry') return 'Find the enquiry (number or title)…';
    return 'Search suppliers, products, customers, enquiries, quotes, jobs, POs…';
  });

  readonly rows = computed<PaletteRow[]>(() => {
    const v = this.view();
    const q = this.query().trim();
    if (v.kind === 'list') return this.listRows(q);
    if (v.kind === 'pickEnquiry') return this.enquiryRows();
    const rows = this.detailRows(v.hit);
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter((r) => !r.run || r.primary || tokens.every((t) => `${r.label} ${r.sub || ''} ${r.ref || ''}`.toLowerCase().includes(t)));
  });

  /** Rows the keyboard can land on. */
  readonly selectable = computed(() => this.rows().filter((r) => r.run || r.product || r.contact));

  readonly activeId = computed(() => this.selectable()[this.activeIndex()]?.id ?? null);

  constructor(
    public palette: CommandPaletteService,
    private _router: Router,
    private _employeeService: EmployeeService,
    private _layout: LayoutService,
    private _theme: ThemeService,
  ) {
    this.search$
      .pipe(
        debounceTime(250),
        tap(({ q }) => this.searching.set(q.length >= 2)),
        switchMap(({ q, modules }) => q.length < 2
          ? of([] as SearchHit[])
          : this.search.search(q, modules).pipe(map((res) => res.data || []), catchError(() => of([] as SearchHit[])))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((hits) => {
        this.hits.set(hits);
        this.searching.set(false);
        this.activeIndex.set(0);
      });

    effect(() => {
      if (!this.palette.isOpen()) return;
      this.target.set(this.activeItemEntry.current());
      this.basket.set(new Map());
      this.contacts.set(new Map());
      this.view.set({ kind: 'list' });
      this.resetQuery();
      this.focus();
    });
  }

  // --- list ------------------------------------------------------------------------

  private listRows(q: string): PaletteRow[] {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const nav = this.navRows();
    const picked = this.basketRows();
    if (!tokens.length) return [...picked, ...nav.slice(0, 50)];
    const pages = nav.filter((r) => tokens.every((t) => `${r.label} ${r.sub}`.toLowerCase().includes(t))).slice(0, 5);
    return [...picked, ...this.hitRows(this.hits()), ...pages];
  }

  /** What to do with the ticked products, offered above everything else while any are ticked. */
  private basketRows(): PaletteRow[] {
    const picked = [...this.basket().values()];
    if (!picked.length) return [];
    const group = `Selected (${picked.length})`;
    const n = `${picked.length} product${picked.length === 1 ? '' : 's'}`;
    const target = this.target();
    const rows: PaletteRow[] = [];
    if (target) rows.push({ id: 'basket:add', group, primary: true, icon: 'heroPlusCircle', label: `Add ${n} to the open ${target.label}`, run: () => this.addToTarget(picked) });
    rows.push({ id: 'basket:rfq', group, primary: !target, icon: 'heroScale', label: `Create RFQ for ${n}`, sub: 'Pick the enquiry, then the supplier', run: () => this.startPickEnquiry(null, picked, null) });
    rows.push({ id: 'basket:clear', group, icon: 'heroXMark', label: 'Clear selection', run: () => { this.basket.set(new Map()); this.activeIndex.set(0); } });
    return rows;
  }

  /** Hits grouped by module, modules ordered by their best match. */
  private hitRows(hits: SearchHit[]): PaletteRow[] {
    const order: SearchModule[] = [];
    hits.forEach((h) => { if (!order.includes(h.module)) order.push(h.module); });
    return order.flatMap((module) => hits.filter((h) => h.module === module).map((h) => this.hitRow(h)));
  }

  private hitRow(h: SearchHit): PaletteRow {
    const drill = DRILLABLE.includes(h.module);
    return {
      id: `hit:${h.module}:${h.id}`,
      group: MODULE_META[h.module].label,
      label: h.title || h.ref || '—',
      sub: h.subtitle,
      ref: h.ref,
      status: h.status,
      icon: MODULE_META[h.module].icon,
      drill,
      product: h.module === 'product' && h.data?.['product'] ? toCatalogueSuggestion(h.data['product']) : undefined,
      run: () => (drill ? this.openDetail(h) : this.openHit(h)),
    };
  }

  /** Where a record lives in the app. */
  private openHit(h: SearchHit): void {
    switch (h.module) {
      case 'supplier': return this.go('/suppliers', { search: h.title });
      case 'product': return this.go('/products', { search: h.ref || h.title });
      case 'customer': return this.go('/customers', { search: h.title });
      case 'enquiry': return this.go('/enquiry', { search: h.ref || h.data?.['enquiryId'] });
      case 'quotation': return this.go(`/quotations/view/${h.id}`);
      case 'job': return this.go('/job-sheet', { search: h.ref || h.data?.['jobId'] });
      case 'purchaseOrder': return this.go(`/purchase/view-lpo/${h.id}`);
      case 'employee': return this.go(`/hr/employees/view/${h.data?.['employeeId'] || h.ref}`);
      case 'salesRfq': return this.openRfq(h.id, h.data?.['enquiryNo']);
    }
  }

  /** A supplier RFQ opens in its drawer on the enquiry page. */
  private openRfq(rfqId: string, enquiryNo?: string): void {
    this.handoff.openRfqId.set(rfqId);
    this.go('/enquiry', enquiryNo ? { search: enquiryNo } : undefined);
  }

  // --- detail ----------------------------------------------------------------------

  openDetail(hit: SearchHit): void {
    this.view.set({ kind: 'detail', hit });
    this.related.set(null);
    this.productSuggestion.set(hit.module === 'product' && hit.data?.['product'] ? toCatalogueSuggestion(hit.data['product']) : null);
    this.contacts.set(new Map());
    this.resetQuery();
    this.focus();
    this.relatedLoading.set(true);
    this.search.related(hit.module, hit.id).subscribe({
      next: (res) => {
        if (!this.isDetailOf(hit)) return;
        this.related.set(res.data || {});
        this.relatedLoading.set(false);
      },
      error: () => {
        if (!this.isDetailOf(hit)) return;
        this.related.set({});
        this.relatedLoading.set(false);
      },
    });
    // The catalogue lookup carries live stock; it replaces the bare search row when it comes back.
    if (hit.module === 'product') {
      const term = hit.ref || hit.data?.['product']?.partNo || hit.title;
      this.quotationService.getProductSuggestions({ search: term, includePending: true }).subscribe({
        next: (res: any) => {
          const row = (res?.data || []).find((p: any) => String(p._id) === hit.id);
          if (row && this.isDetailOf(hit)) this.productSuggestion.set(toCatalogueSuggestion(row));
        },
        error: () => undefined,
      });
    }
  }

  private isDetailOf(hit: SearchHit): boolean {
    const v = this.view();
    return v.kind === 'detail' && v.hit === hit;
  }

  private detailRows(hit: SearchHit): PaletteRow[] {
    const data = this.related();
    const rows: PaletteRow[] = [];
    const target = this.target();
    const open = { id: 'open', group: 'Actions', label: `Open ${MODULE_META[hit.module].one}`, icon: 'heroArrowRightCircle', run: () => this.openHit(hit) };

    switch (hit.module) {
      case 'supplier': {
        const products: any[] = data?.['products'] || [];
        const picked = [...this.basket().values()];
        const supplier = {
          supplierId: hit.id,
          supplierName: hit.data?.['supplierName'] || hit.title,
          contactEmail: hit.data?.['contactEmail'],
          isSupplierApproved: !!hit.data?.['isSupplierApproved'],
        };
        rows.push({
          id: 'rfq', group: 'Actions', primary: true, icon: 'heroScale',
          label: picked.length ? `Create RFQ to ${supplier.supplierName} for ${picked.length} product${picked.length === 1 ? '' : 's'}` : `Create RFQ to ${supplier.supplierName}`,
          sub: picked.length ? 'Pick the enquiry next' : 'Tick products below, or pick the enquiry and use its lines',
          run: () => this.startPickEnquiry(supplier, picked, hit),
        });
        if (target && picked.length) {
          rows.push({ id: 'add', group: 'Actions', primary: true, icon: 'heroPlusCircle', label: `Add ${picked.length} selected to the open ${target.label}`, run: () => this.addToTarget(picked) });
        }
        rows.push(open);
        this.pushLoading(rows);
        if (data) {
          if (products.length) {
            rows.push({ id: 'products:all', group: `Products (${products.length})`, icon: 'heroCheckCircle', label: products.every((p) => this.basket().has(String(p._id))) ? 'Clear these' : 'Select all', run: () => this.toggleAll(products) });
            products.forEach((p) => rows.push({
              id: `product:${p._id}`, group: `Products (${products.length})`, icon: 'heroCube',
              label: p.productName || p.productDescription || p.partNo,
              sub: [p.partNo, p.productCategory?.categoryName, p.link].filter(Boolean).join(' · '),
              ref: p.itemCode, status: p.approvalStatus === 'Approved' ? undefined : p.approvalStatus,
              product: toCatalogueSuggestion(p),
            }));
          } else {
            rows.push({ id: 'products:none', group: 'Products', icon: 'heroCube', label: 'No catalogue products linked to this supplier yet', sub: 'Products show here once this supplier is their default vendor or has been sent a PO for them' });
          }
          this.pushRfqs(rows, data['openRfqs'], 'Open RFQs to this supplier');
          this.pushPos(rows, data['purchaseOrders'], 'Purchase orders');
        }
        break;
      }

      case 'product': {
        const s = this.productSuggestion();
        if (s) {
          const ticked = this.basket().has(String(s._id));
          rows.push({ id: 'pick', group: 'Actions', icon: ticked ? 'heroCheckCircle' : 'heroPlusCircle', label: ticked ? 'Remove from selection' : 'Select this product', sub: 'Combine with other products, then add or raise one RFQ', run: () => this.toggleProduct(s) });
        }
        if (s && target) rows.push({ id: 'add', group: 'Actions', primary: true, icon: 'heroPlusCircle', label: `Add to the open ${target.label}`, sub: this.stockText(s), run: () => this.addToTarget([s]) });
        if (s) rows.push({ id: 'rfq', group: 'Actions', primary: !target, icon: 'heroScale', label: 'Ask suppliers for a price (new RFQ)', sub: 'Pick the enquiry, then the supplier', run: () => this.startPickEnquiry(null, [s], hit) });
        rows.push(open);
        if (s?.stockStatus || s?.stockOnHand != null) rows.push({ id: 'stock', group: 'Stock', icon: 'heroArchiveBoxArrowDown', label: this.stockText(s) || 'No stock information' });
        this.pushLoading(rows);
        if (data) {
          const suppliers: any[] = data['suppliers'] || [];
          suppliers.forEach((sup) => rows.push({
            id: `supplier:${sup._id}`, group: 'Suppliers', icon: 'heroBuildingOffice',
            label: `Ask ${sup.supplierName} for a price`, sub: sup.link, ref: sup.supplierId,
            run: () => s && this.startPickEnquiry({ supplierId: String(sup._id), supplierName: sup.supplierName, contactEmail: sup.contactDetails?.email, isSupplierApproved: sup.status === 'Approved' }, [s], hit),
          }));
          if (!suppliers.length) rows.push({ id: 'suppliers:none', group: 'Suppliers', icon: 'heroBuildingOffice', label: 'No default vendor or past PO supplier' });
          this.pushRfqs(rows, data['openRfqs'], 'Open RFQs asking for it');
          (data['quotations'] || []).forEach((x: any) => rows.push({
            id: `quote:${x._id}`, group: 'Quoted in', icon: 'heroDocumentText', label: x.subject || x.quoteId, sub: x.client?.companyName, ref: x.quoteId, status: x.status,
            run: () => this.go(`/quotations/view/${x._id}`),
          }));
          this.pushPos(rows, data['purchaseOrders'], 'Purchase orders');
        }
        break;
      }

      case 'customer': {
        const emails = [...this.contacts().values()];
        if (emails.length) {
          const msg = `${emails.length} email${emails.length === 1 ? '' : 's'}`;
          rows.push({ id: 'copy', group: 'Actions', primary: true, icon: 'heroClipboardDocument', label: `Copy ${msg}`, sub: 'Ready to paste into a mail', run: () => this.copy(emails.join('; '), `${msg} copied`) });
        }
        rows.push(open);
        this.pushLoading(rows);
        if (data) {
          (data['contacts'] || []).forEach((c: any) => rows.push({
            id: `contact:${c._id}`, group: 'Contacts', icon: 'heroUser', label: c.name + (c.isPrimary ? ' (primary)' : ''),
            sub: [c.designation, c.email, c.phoneNo].filter(Boolean).join(' · '),
            contact: c.email ? { id: String(c._id), email: c.email } : undefined,
          }));
          (data['enquiries'] || []).forEach((e: any) => rows.push({
            id: `enq:${e._id}`, group: 'Enquiries', icon: 'heroInboxArrowDown', label: e.title || e.enquiryId, ref: e.enquiryId, status: e.status,
            run: () => this.go('/enquiry', { search: e.enquiryId }),
          }));
          (data['quotations'] || []).forEach((x: any) => rows.push({
            id: `quote:${x._id}`, group: 'Quotations', icon: 'heroDocumentText', label: x.subject || x.quoteId, ref: x.quoteId, status: x.status,
            run: () => this.go(`/quotations/view/${x._id}`),
          }));
          this.pushJobs(rows, data['jobs']);
        }
        break;
      }

      case 'enquiry': {
        const enquiryStatus = String(data?.['enquiry']?.status || hit.status || '').toLowerCase();
        if (!CLOSED_ENQUIRY.includes(enquiryStatus)) {
          rows.push({ id: 'rfq', group: 'Actions', primary: true, icon: 'heroScale', label: 'Create supplier RFQ', sub: 'Opens the RFQ drawer with this enquiry\'s lines', run: () => this.handOffRfq({ enquiryId: hit.id, supplier: null, products: [] }, hit.ref) });
        }
        rows.push(open);
        this.pushLoading(rows);
        if (data) {
          this.pushRfqs(rows, data['rfqs'], 'Supplier RFQs', hit.ref);
          (data['quotations'] || []).forEach((x: any) => rows.push({
            id: `quote:${x._id}`, group: 'Quotations', icon: 'heroDocumentText', label: x.subject || x.quoteId, ref: x.quoteId, status: x.status,
            run: () => this.go(`/quotations/view/${x._id}`),
          }));
        }
        break;
      }

      case 'quotation': {
        rows.push(open);
        this.pushLoading(rows);
        if (data) {
          const enq = data['quotation']?.enqId;
          if (enq?._id) rows.push({ id: `enq:${enq._id}`, group: 'Enquiry', icon: 'heroInboxArrowDown', label: enq.title || enq.enquiryId, ref: enq.enquiryId, run: () => this.go('/enquiry', { search: enq.enquiryId }) });
          this.pushJobs(rows, data['jobs']);
          this.pushPos(rows, data['purchaseOrders'], 'Purchase orders');
        }
        break;
      }

      case 'job': {
        rows.push(open);
        this.pushLoading(rows);
        if (data) {
          const q = data['job']?.quoteId;
          if (q?._id) rows.push({ id: `quote:${q._id}`, group: 'Quotation', icon: 'heroDocumentText', label: q.subject || q.quoteId, sub: q.client?.companyName, ref: q.quoteId, run: () => this.go(`/quotations/view/${q._id}`) });
          const pp = data['job']?.procurementPerson;
          if (pp) rows.push({ id: 'pp', group: 'People', icon: 'heroUser', label: `${pp.firstName || ''} ${pp.lastName || ''}`.trim(), sub: 'Procurement', ref: pp.employeeId, run: () => this.go(`/hr/employees/view/${pp.employeeId}`) });
          this.pushPos(rows, data['purchaseOrders'], 'Purchase orders');
        }
        break;
      }
    }
    return rows;
  }

  private pushLoading(rows: PaletteRow[]): void {
    if (this.relatedLoading()) rows.push({ id: 'loading', group: 'Linked records', icon: 'heroArrowPath', label: 'Loading linked records…' });
  }

  private pushRfqs(rows: PaletteRow[], rfqs: any[] | undefined, group: string, enquiryNo?: string): void {
    (rfqs || []).forEach((r) => rows.push({
      id: `rfq:${r._id}`, group, icon: 'heroScale',
      label: (r.suppliers || []).map((s: any) => s.supplierName).join(', ') || r.enquiryId?.title || r.rfqNo,
      sub: r.enquiryId?.enquiryId ? `${r.enquiryId.enquiryId} · ${r.enquiryId.title || ''}` : undefined,
      ref: r.rfqNo, status: r.status,
      run: () => this.openRfq(String(r._id), r.enquiryId?.enquiryId || enquiryNo),
    }));
  }

  private pushPos(rows: PaletteRow[], pos: any[] | undefined, group: string): void {
    (pos || []).forEach((p) => rows.push({
      id: `po:${p._id}`, group, icon: 'heroShoppingCart',
      label: p.subject || p.poNo, sub: p.supplierId?.supplierName, ref: p.poNo, status: p.poStatus,
      run: () => this.go(`/purchase/view-lpo/${p._id}`),
    }));
  }

  private pushJobs(rows: PaletteRow[], jobs: any[] | undefined): void {
    (jobs || []).forEach((j) => rows.push({
      id: `job:${j._id}`, group: 'Jobs', icon: 'heroBriefcase',
      label: j.quoteId?.subject || j.jobId, sub: j.allocateType, ref: j.jobId, status: j.status,
      run: () => this.go('/job-sheet', { search: j.jobId }),
    }));
  }

  private stockText(s: ItemSuggestion): string {
    if (s.stockAvailable == null && s.stockOnHand == null) return s.stockStatus || '';
    const parts = [`${s.stockAvailable ?? 0} available`];
    if (s.stockOnHand != null && s.stockOnHand !== s.stockAvailable) parts.push(`${s.stockOnHand} on hand`);
    return parts.join(' · ') + (s.uom ? ` ${s.uom}` : '');
  }

  toggleProduct(s: ItemSuggestion): void {
    this.basket.update((m) => {
      const next = new Map(m);
      const id = String(s._id);
      if (next.has(id)) next.delete(id);
      else next.set(id, s);
      return next;
    });
  }

  private toggleAll(products: any[]): void {
    const all = products.every((p) => this.basket().has(String(p._id)));
    this.basket.update((m) => {
      const next = new Map(m);
      products.forEach((p) => (all ? next.delete(String(p._id)) : next.set(String(p._id), toCatalogueSuggestion(p))));
      return next;
    });
  }

  /** Ticks or unticks a row's product or contact. */
  toggleRow(row: PaletteRow): void {
    if (row.product) return this.toggleProduct(row.product);
    const c = row.contact;
    if (!c) return;
    this.contacts.update((m) => {
      const next = new Map(m);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c.email);
      return next;
    });
  }

  isSelected(row: PaletteRow): boolean {
    if (row.product) return this.basket().has(String(row.product._id));
    return !!row.contact && this.contacts().has(row.contact.id);
  }

  // --- actions ---------------------------------------------------------------------

  private addToTarget(products: ItemSuggestion[]): void {
    const target = this.target();
    if (!target?.canAdd()) {
      this.toaster.warning('The item list is no longer open.');
      return;
    }
    const added = target.addProducts(products);
    this.toaster.success(`${added} line${added === 1 ? '' : 's'} added to the ${target.label}.`);
    this.palette.close();
  }

  private startPickEnquiry(supplier: RfqPreset['supplier'], products: ItemSuggestion[], from: SearchHit | null): void {
    this.view.set({ kind: 'pickEnquiry', supplier, products, from });
    this.hits.set([]);
    this.resetQuery();
    this.focus();
  }

  private enquiryRows(): PaletteRow[] {
    const v = this.view();
    if (v.kind !== 'pickEnquiry') return [];
    const rows: PaletteRow[] = [];
    const what = [v.products.length ? `${v.products.length} product${v.products.length === 1 ? '' : 's'}` : '', v.supplier ? `to ${v.supplier.supplierName}` : '']
      .filter(Boolean).join(' ');
    rows.push({ id: 'pick:info', group: 'New RFQ', icon: 'heroScale', label: `RFQ ${what}`.trim(), sub: 'An RFQ is raised for an enquiry — search for it above' });
    this.hits()
      .filter((h) => h.module === 'enquiry' && !CLOSED_ENQUIRY.includes(String(h.status || '').toLowerCase()))
      .forEach((h) => rows.push({
        id: `pick:${h.id}`, group: 'Open enquiries', icon: 'heroInboxArrowDown', label: h.title, sub: h.subtitle, ref: h.ref, status: h.status,
        run: () => this.handOffRfq({ enquiryId: h.id, supplier: v.supplier, products: v.products }, h.ref),
      }));
    return rows;
  }

  private handOffRfq(preset: RfqPreset, enquiryNo?: string): void {
    this.handoff.rfq.set(preset);
    this.go('/enquiry', enquiryNo ? { search: enquiryNo } : undefined);
  }

  private copy(text: string, message: string): void {
    navigator.clipboard?.writeText(text).then(() => this.toaster.success(message), () => undefined);
  }

  // --- input & keyboard ------------------------------------------------------------

  onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    const v = this.view();
    if (v.kind === 'list') this.search$.next({ q: value.trim() });
    else if (v.kind === 'pickEnquiry') this.search$.next({ q: value.trim(), modules: ['enquiry'] });
  }

  back(): void {
    const v = this.view();
    if (v.kind === 'pickEnquiry' && v.from) return this.openDetail(v.from);
    this.view.set({ kind: 'list' });
    this.hits.set([]);
    this.resetQuery();
    this.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.selectable();
    const count = list.length;
    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex.update((i) => (count ? (i + 1) % count : 0));
        break;
      case 'ArrowUp':
        this.activeIndex.update((i) => (count ? (i - 1 + count) % count : 0));
        break;
      case 'Enter':
        this.choose(list[this.activeIndex()]);
        break;
      case ' ':
      case 'Tab': {
        const row = list[this.activeIndex()];
        // Space is a typed space in the list view, so there Tab is the only tick key.
        if (!row || (!row.product && !row.contact) || (event.key === ' ' && this.view().kind === 'list')) return;
        this.toggleRow(row);
        break;
      }
      case 'Backspace':
        if (this.query() || this.view().kind === 'list') return;
        this.back();
        break;
      case 'Escape':
        if (this.view().kind !== 'list') this.back();
        else this.palette.close();
        break;
      default:
        return;
    }
    event.preventDefault();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setTimeout(() => document.getElementById('palette-option-' + this.activeId())?.scrollIntoView({ block: 'nearest' }));
    }
  }

  choose(row: PaletteRow | undefined): void {
    if (!row) return;
    if (!row.run && (row.product || row.contact)) return this.toggleRow(row);
    row.run?.();
  }

  hover(row: PaletteRow): void {
    const i = this.selectable().indexOf(row);
    if (i >= 0) this.activeIndex.set(i);
  }

  /** Whether a section header goes above this row. */
  startsGroup(i: number): boolean {
    const rows = this.rows();
    return i === 0 || rows[i - 1].group !== rows[i].group;
  }

  private resetQuery(): void {
    this.query.set('');
    this.activeIndex.set(0);
    this.search$.next({ q: '' });
  }

  private focus(): void {
    setTimeout(() => this.queryInput?.nativeElement.focus());
  }

  private go(url: string, queryParams?: Record<string, any>): void {
    this.palette.close();
    this._router.navigate([url], queryParams ? { queryParams } : undefined);
  }

  private close(then: () => void): void {
    this.palette.close();
    then();
  }
}
