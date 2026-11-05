import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { GrnListModalComponent, GrnListModalData } from 'src/app/shared/components/grn-list-modal/grn-list-modal.component';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridDetailTab,
  DataGridQuery,
  DataGridRowAction,
  DataGridRowActionEvent,
  DataGridView,
} from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument, DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';

const STATUS_CLASSES: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200',
  Placed: 'bg-teal-50 text-teal-700 ring-teal-200 border-teal-200',
  Closed: 'bg-sky-50 text-sky-700 ring-sky-200 border-sky-200',
};

const RECEIPT_CLASSES: Record<string, string> = {
  'Not Received': 'bg-gray-100 text-gray-700 ring-gray-200 border-gray-200',
  'Partially Received': 'bg-amber-50 text-amber-700 ring-amber-200 border-amber-200',
  Received: 'bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200',
};

@Component({
  selector: 'app-vendor-bills',
  standalone: true,
  imports: [CommonModule, DataGridComponent, DetailOverviewComponent, DetailTableComponent, DetailDocumentsComponent, DetailTimelineComponent],
  templateUrl: './vendor-bills.component.html',
  styleUrl: './vendor-bills.component.css',
})
export class VendorBillsComponent implements OnInit {
  @ViewChild('grid') grid!: DataGridComponent<any>;

  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly deliveryNoteService = inject(DeliveryNoteService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly notificationService = inject(ToastrService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoices = inject(CustomerInvoiceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly auditLog = inject(AuditLogService);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub?: Subscription;
  canApprovePdc = false;
  updatingPdc = false;

  rows: any[] = [];
  total = 0;
  isLoading = false;
  page = 1;
  pageSize = 15;
  search = '';
  activeViewId = 'all';

  readonly breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Finance' }, { label: 'Supplier Bills' }];
  views: DataGridView<any>[] = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'not-received', label: 'Not Received' },
    { id: 'received', label: 'Received' },
  ];
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'files' },
    { id: 'history', label: 'History', icon: 'clock' },
  ];

  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  /** Recorded events of the purchase order behind the bill. */
  historyFor(row: any): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('purchaseOrder', row._id).subscribe({
        next: (entries) => subject!.next(toTimelineEntries(entries)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }
  readonly rowActions: DataGridRowAction<any>[] = [
    ...['Approved', 'Rejected', 'Revoked'].map(status => ({
      id: 'pdc-' + status, label: status === 'Approved' ? 'Approve PDC' : status === 'Rejected' ? 'Reject PDC' : 'Revoke PDC',
      icon: status === 'Approved' ? 'check' : 'close', quick: true, panel: true,
      hidden: (row: any) => this.activeViewId !== 'pdc' || !this.canApprovePdc || this.updatingPdc || row.pdcStatus !== (status === 'Revoked' ? 'Approved' : 'Pending'),
    })),
    { id: 'view-po', label: 'View PO', icon: 'card', quick: true, panel: false, hidden: () => this.isInvoiceView },
    { id: 'view-grn', label: 'View GRN', icon: 'eye', quick: true, panel: false, hidden: (row) => this.isInvoiceView || !row.grns?.length },
    { id: 'view-documents', label: 'View documents', icon: 'files', quick: true, panel: false, hidden: () => this.isInvoiceView },
    { id: 'download-dn', label: 'Download delivery note', icon: 'download', panel: false, hidden: (row) => this.isInvoiceView || !this.deliveryNote(row) },
    { id: 'download-invoice', label: 'Download invoice', icon: 'download', panel: false, hidden: (row) => this.isInvoiceView || !this.invoiceDeliveryNote(row) },
  ];
  readonly poColumns: DataGridColumn<any>[] = [
    { key: 'poDate', label: 'PO Date', type: 'date', width: '125px' },
    { key: 'poNo', label: 'PO No', locked: true },
    { key: 'supplier', label: 'Supplier', valueGetter: (row) => row.supplierId?.supplierName || '-' },
    { key: 'job', label: 'Job No', valueGetter: (row) => row.jobId?.jobId || '-' },
    { key: 'poStatus', label: 'PO Status', type: 'badge', badgeClasses: STATUS_CLASSES },
    { key: 'expectedDeliveryDate', label: 'Expected', type: 'date', width: '125px' },
    { key: 'receiptStatus', label: 'Receipt', type: 'badge', badgeClasses: RECEIPT_CLASSES },
    { key: 'dnInvoice', label: 'Invoice', visible: false, valueGetter: (row) => this.invoiceLabel(row) },
    // Only meaningful once goods arrive; shown on the Partly Received and Received tabs.
    { key: 'grnDate', label: 'Received / GRN Date', type: 'date', width: '150px', visible: false, valueGetter: (row) => this.lastGrnDate(row) },
    { key: 'paymentTerms', label: 'Payment Terms' },
    { key: 'amount', label: 'PO Value', align: 'right', valueGetter: (row) => this.amount(row) },
  ];
  readonly invoiceColumns: DataGridColumn<any>[] = [
    { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
    { key: 'invoiceNo', label: 'Invoice No', locked: true },
    { key: 'dnNo', label: 'DN No' },
    { key: 'poNo', label: 'PO No' },
    { key: 'client', label: 'Client', valueGetter: row => row.client?.name || '-' },
    { key: 'jobNo', label: 'Job No' },
    { key: 'status', label: 'Status', type: 'badge' },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'createdAt', label: 'Created Date', type: 'date' },
    { key: 'createdBy', label: 'Created By', valueGetter: row => `${row.createdBy?.firstName || ''} ${row.createdBy?.lastName || ''}`.trim() || '-' },
  ];
  readonly pdcColumns: DataGridColumn<any>[] = [...this.invoiceColumns, { key: 'pdcStatus', label: 'PDC Status', type: 'badge' }];
  get isInvoiceView(): boolean {
    return this.activeViewId === 'invoices' || this.activeViewId === 'pdc';
  }
  get columns(): DataGridColumn<any>[] {
    if (this.activeViewId === 'invoices') return this.invoiceColumns;
    return this.activeViewId === 'pdc' ? this.pdcColumns : this.poColumns;
  }
  get emptyMessage(): string {
    return this.isInvoiceView ? 'No customer invoices yet' : 'No approved purchase orders are waiting for finance';
  }
  readonly itemColumns: DetailTableColumn[] = [
    { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
    { key: 'description', label: 'Description', truncate: true },
    { key: 'partNo', label: 'Part No', hiddenByDefault: true },
    { key: 'ordered', label: 'Ordered', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
    { key: 'total', label: 'Total', type: 'currency', total: true },
  ];

  readonly title = (row: any) => row.invoiceNo || row.poNo || 'Purchase Order';
  readonly subtitle = (row: any) => row.invoiceNo ? (row.client?.name || '') : (row.supplierId?.supplierName || '');

  ngOnInit(): void {
    this.employeeService.employeeData$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(employee => {
      this.canApprovePdc = /^(superadmin|admin)$/i.test(employee?.category?.role || '') || !!employee?.category?.privileges?.invoice?.pdcApprove;
    });
    this.destroyRef.onDestroy(() => this.loadSub?.unsubscribe());
    // Notifications deep-link with ?view=upcoming; the grid restores the tab without asking for data.
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view && this.views.some((v) => v.id === view)) this.activeViewId = view;
    this.syncViewColumns();
    this.load();
    this.refreshViewCounts();
  }

  onQueryChange(query: DataGridQuery): void {
    this.page = query.page;
    this.pageSize = query.pageSize;
    const searchChanged = this.search !== query.search;
    this.search = query.search;
    this.activeViewId = query.viewId || 'all';
    this.syncViewColumns();
    this.load();
    if (searchChanged) this.refreshViewCounts();
  }

  onRowAction({ action, row }: DataGridRowActionEvent<any>): void {
    if (action.id.startsWith('pdc-')) {
      if (!this.canApprovePdc || this.updatingPdc || this.activeViewId !== 'pdc') return;
      this.updatingPdc = true;
      this.invoices.updatePdcStatus(row._id, action.id.slice(4)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: response => { Object.assign(row, response.data); this.updatingPdc = false; this.notificationService.success('PDC status updated'); this.load(); },
        error: error => { this.updatingPdc = false; this.notificationService.error(error.error?.message || 'Failed to update PDC'); this.load(); },
      });
      return;
    }
    if (action.id === 'view-po') this.previewPo(row);
    if (action.id === 'view-grn') this.viewGrn(row);
    if (action.id === 'view-documents') this.grid.openRow(row, 'documents');
    if (action.id === 'download-dn') this.renderDeliveryNote(this.deliveryNote(row), true);
    if (action.id === 'download-invoice') this.downloadDnInvoice(this.invoiceDeliveryNote(row));
  }

  private viewGrn(row: any): void {
    const grns = row?.grns ?? [];
    if (grns.length === 1) { this.router.navigate(['/grn/view-grn', grns[0]._id]); return; }
    this.dialog.open(GrnListModalComponent, { data: { lpoId: row._id, lpoNo: row.poNo, grns, hasBalanceQty: false } as GrnListModalData });
  }

  /** The list row isn't fully populated (supplier contacts, quote, terms), so the PO is loaded in full first. */
  private previewPo(row: any): void {
    this.purchaseOrderService.getPurchaseOrderById(row._id).subscribe({
      next: (response: any) => {
        const po = response?.success ? response.data : response;
        this.purchaseService.generatePDF(po, false)
          .then((pdf) => pdf.getBlob((blob: Blob) => {
            this.dialog.open(PdfPreviewComponent, { data: { url: window.URL.createObjectURL(blob), formatedQuote: po, type: 'purchase' } });
          }))
          .catch(() => this.notificationService.error('Error generating PDF. Please try again.'));
      },
      error: () => this.notificationService.error('Failed to load the PO'),
    });
  }

  // PO files plus the invoices and delivery notes captured on each GRN against it.
  documents(row: any): DetailDocument[] {
    const docs: DetailDocument[] = [];
    const add = (files: any[] | undefined, source: string, key: string, date?: any) => (files || []).forEach((f: any, i: number) => {
      if (!f?.fileName) return;
      docs.push({ id: `${key}:${i}`, name: f.originalname || f.fileName, uploadedBy: source, date: f.uploadedAt || date });
    });
    add(row.documents, 'PO document', 'po');
    add(row.supplierInvoices, 'PO supplier invoice', 'po-inv');
    (row.grns || []).forEach((grn: any, g: number) => {
      const label = grn.grnNo || 'GRN';
      add(grn.supplierInvoices, `${label} · Supplier invoice`, `grn-${g}-inv`, grn.grnDate);
      add(grn.supplierDeliveryNotes, `${label} · Delivery note`, `grn-${g}-dn`, grn.grnDate);
    });
    return docs;
  }

  openDocument(row: any, doc: DetailDocument): void {
    const file = this.documentFile(row, doc.id);
    if (!file?.fileName) return;
    this.purchaseOrderService.getFile(file.fileName).subscribe({
      next: (blob) => {
        const extension = file.fileName.split('.').pop()?.toLowerCase() ?? '';
        const mime = VendorBillsComponent.PREVIEW_MIME[extension];
        const url = window.URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: (error) => {
        if (error.status === 404) this.notificationService.warning('The file was not found on the server.');
        else this.notificationService.error('An error occurred while opening the file.');
      },
    });
  }

  private static readonly PREVIEW_MIME: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', txt: 'text/plain',
  };

  private documentFile(row: any, id: string): any {
    const [key, index] = id.split(':');
    const i = Number(index);
    if (key === 'po') return row.documents?.[i];
    if (key === 'po-inv') return row.supplierInvoices?.[i];
    const [, g, kind] = key.split('-');
    const grn = row.grns?.[Number(g)];
    return (kind === 'inv' ? grn?.supplierInvoices : grn?.supplierDeliveryNotes)?.[i];
  }

  private syncViewColumns(): void {
    const grnDate = this.poColumns.find((column) => column.key === 'grnDate');
    if (grnDate) grnDate.visible = this.activeViewId === 'received';
    const invoice = this.poColumns.find((column) => column.key === 'dnInvoice');
    if (invoice) invoice.visible = this.activeViewId === 'ready-to-deliver';
  }

  // Latest GRN posted against the PO.
  private lastGrnDate(row: any): any {
    const dates = (row.grns || []).map((g: any) => g.grnDate).filter(Boolean).map((d: any) => new Date(d).getTime());
    return dates.length ? new Date(Math.max(...dates)) : null;
  }

  amount(row: any): string {
    const currency = row.currency || 'QAR';
    return `${Number(row.amount ?? row.totalLpoValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }

  overviewSections(row: any): DetailOverviewSection[] {
    if (row.invoiceNo) return [{ title: 'Invoice details', columns: '2', fields: [
      ...[
        ['Client', row.client?.name], ['Attention', row.attention], ['Invoice No', row.invoiceNo],
        ['Invoice Date', this.date(row.invoiceDate)], ['DN No', row.dnNo], ['LPO Ref (Customer LPO No)', row.lpoRef],
        ['Subject', row.subject], ['Payment Terms', row.paymentTerms], ['Payment Method', row.paymentMethod],
        ['PO No', row.poNo], ['Job No', row.jobNo], ['Status', row.status], ['Amount', this.amount(row)],
        ...(row.paymentMethod === 'PDC' ? [['PDC Status', row.pdcStatus || 'Pending']] : []),
        ['Created Date', this.date(row.createdAt)], ['Created By', `${row.createdBy?.firstName || ''} ${row.createdBy?.lastName || ''}`.trim()],
      ].map(([label, value]) => ({ type: 'field' as const, label, value: value || '-' })),
    ] }];
    return [
      {
        title: 'Finance preparation', columns: '2',
        fields: [
          { type: 'field', label: 'PO status', value: row.poStatus || '-' },
          { type: 'field', label: 'Receipt status', value: row.receiptStatus || 'Not Received' },
          { type: 'field', label: 'Bill status', value: row.billingStatus || 'Not Billed' },
          { type: 'field', label: 'PO value', value: this.amount(row) },
        ],
      },
      {
        title: 'Terms and delivery', columns: '2',
        fields: [
          { type: 'field', label: 'Payment terms', value: row.paymentTerms || '-' },
          { type: 'field', label: 'Expected delivery', value: this.date(row.expectedDeliveryDate) },
          { type: 'field', label: 'Delivery location', value: row.placeOfDelivery || '-' },
          { type: 'field', label: 'Job no', value: row.jobId?.jobId || '-' },
        ],
      },
    ];
  }

  itemRows(row: any): Record<string, any>[] {
    return (row.items || []).map((item: any) => ({
      itemCode: item.itemCode || '',
      partNo: item.partNo || item.productPartNo || '',
      description: item.description || item.detail || '-',
      ordered: Number(item.quantity || 0),
      unitCost: Number(item.unitCost || 0),
      total: Number(item.totalCost || 0),
    }));
  }

  deliveryNotes(row: any): any[] {
    return row.deliveryNotes || [];
  }

  private deliveryNote(row: any): any | null {
    return this.deliveryNotes(row)[0] || null;
  }

  private invoiceDeliveryNote(row: any): any | null {
    return this.deliveryNotes(row).find((dn: any) => this.canPreviewDnInvoice(dn)) || null;
  }

  private invoiceLabel(row: any): string {
    const dn = this.invoiceDeliveryNote(row);
    return dn ? `${dn.dnNo || 'DN'} invoice` : 'Not available';
  }

  private renderDeliveryNote(dn: any, download: boolean): void {
    if (!dn?._id) return;
    this.deliveryNoteService.getDnById(dn._id).subscribe({
      next: (response: any) => {
        const deliveryNote = response?.data || response;
        const render = (invoiceNo?: string) => this.deliveryNoteService.generatePDF({ ...deliveryNote, invoiceNo }, true)
          .then((pdf) => download
            ? pdf.download(`${deliveryNote.dnNo || 'delivery-note'}.pdf`)
            : pdf.getBlob((blob: Blob) => this.dialog.open(PdfPreviewComponent, {
              height: '90vh',
              maxWidth: '1200px',
              data: { url: window.URL.createObjectURL(blob), formatedQuote: deliveryNote, type: 'delivery-note' },
            })))
          .catch(() => this.notificationService.error('Failed to generate the Delivery Note PDF'));
        if (!this.canPreviewDnInvoice(dn)) {
          render();
          return;
        }
        this.deliveryNoteService.getDnInvoice(dn._id).subscribe({
          next: (invoiceResponse: any) => render(invoiceResponse?.data?.invoiceNo),
          error: () => render(),
        });
      },
      error: () => this.notificationService.error('Failed to load the delivery note'),
    });
  }

  canPreviewDnInvoice(dn: any): boolean {
    return dn?.status !== 'Draft' && dn?.status !== 'Cancelled';
  }

  previewDnInvoice(dn: any): void {
    this.renderDnInvoice(dn, false);
  }

  downloadDnInvoice(dn: any): void {
    this.renderDnInvoice(dn, true);
  }

  private renderDnInvoice(dn: any, download: boolean): void {
    if (!this.canPreviewDnInvoice(dn)) return;
    this.deliveryNoteService.getDnInvoice(dn._id).subscribe({
      next: (response: any) => {
        const invoice = response?.data;
        if (!invoice) {
          this.notificationService.error('Invoice details are not available');
          return;
        }
        this.invoiceService.generateInvoicePDF(invoice)
          .then((pdf) => download
            ? pdf.download(`${invoice.isPreview ? `invoice-${dn.dnNo}` : (invoice.invoiceNo || 'invoice')}.pdf`)
            : pdf.getBlob((blob: Blob) => this.openInvoicePreview(blob, invoice)))
          .catch(() => this.notificationService.error('Failed to generate the invoice PDF'));
      },
      error: () => this.notificationService.error('Failed to load the invoice details'),
    });
  }

  private openInvoicePreview(blob: Blob, invoice: any): void {
    this.dialog.open(PdfPreviewComponent, {
      height: '90vh',
      maxWidth: '1200px',
      data: { url: window.URL.createObjectURL(blob), formatedQuote: invoice, type: 'invoice' },
    });
  }

  private load(): void {
    this.loadSub?.unsubscribe();
    this.isLoading = true;
    this.loadSub = this.purchaseOrderService.getAllPurchaseOrders({
      page: this.page,
      row: this.pageSize,
      search: this.search || undefined,
      receiptStatus: this.receiptStatus(),
      status: this.activeViewId === 'upcoming' ? ['Placed'] : undefined,
      vendorBills: true,
    }).subscribe({
      next: (response) => {
        this.rows = response?.data || [];
        this.total = response?.pagination?.total || 0;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading vendor bills:', error);
        this.notificationService.error('Failed to load supplier bills');
        this.isLoading = false;
      },
    });
  }

  /** Server-paged tabs only know their own total, so ask each view for a one-row page to get its count. */
  private refreshViewCounts(): void {
    const countOf = (id: string) => {
      return this.purchaseOrderService.getAllPurchaseOrders({
        page: 1,
        row: 1,
        search: this.search || undefined,
        receiptStatus: this.receiptStatus(id),
        status: id === 'upcoming' ? ['Placed'] : undefined,
        vendorBills: true,
      }).pipe(map((r: any) => r?.pagination?.total ?? 0), catchError(() => of(undefined)));
    };
    forkJoin(this.views.map((v) => countOf(v.id))).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((counts) => {
      this.views = this.views.map((v, i) => ({ ...v, count: counts[i], hideCount: counts[i] === undefined }));
    });
  }

  private setViewCount(id: string, count: number): void {
    this.views = this.views.map((view) => view.id === id ? { ...view, count, hideCount: false } : view);
  }

  private receiptStatus(viewId = this.activeViewId): string | undefined {
    if (viewId === 'not-received') return 'Not Received';
    if (viewId === 'received') return 'Partially Received,Received';
    return undefined;
  }

  private date(value: any): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
