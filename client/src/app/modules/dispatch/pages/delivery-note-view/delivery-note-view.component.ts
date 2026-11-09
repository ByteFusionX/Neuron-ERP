import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { ConfirmDeliveryData, ConfirmDeliveryModalComponent } from '../../components/confirm-delivery-modal/confirm-delivery-modal.component';
import { ToastrService } from 'ngx-toastr';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DeliveryNote } from 'src/app/shared/interfaces/delivery-note.interface';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailViewShellComponent, DetailViewStat } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from 'src/app/shared/components/detail-panel/detail-fields-menu.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocument, DetailFootRow, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DETAIL_TONE, DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerInvoiceFormComponent } from 'src/app/modules/finance/pages/vendor-bills/customer-invoice-form.component';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { CreateDnComponent } from '../create-dn/create-dn.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActionMenuComponent, ActionMenuItem } from 'src/app/shared/components/action-menu/action-menu.component';

const STATUS_TONES: Record<string, DetailTone> = {
  Draft: 'neutral',
  'Ready to Deliver': 'info',
  Dispatched: 'active',
  Delivered: 'good',
  'Partially Delivered': 'warn',
  'Partially Rejected': 'warn',
  Rejected: 'bad',
  Cancelled: 'bad',
};

/** A label/value in the Details section or a side panel; ids link out, statuses show as dot + text. */
interface DnFact {
  label: string;
  value: string;
  link?: any[];
  state?: { dot: string; text: string };
}

type PanelTab = 'pricing' | 'documents' | 'history' | 'history';

@Component({
  selector: 'app-delivery-note-view',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    ActionButtonComponent,
    DetailViewShellComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailFieldsMenuComponent,
    DetailTableComponent,
    DetailDocumentsComponent,
    DetailTimelineComponent,
    SmartFormModule,
    CustomerInvoiceFormComponent,
    CreateDnComponent,
    ActionMenuComponent
  ],
  templateUrl: './delivery-note-view.component.html',
  styleUrl: './delivery-note-view.component.css'
})
export class DeliveryNoteViewComponent {
  private dnService = inject(DeliveryNoteService);
  private notificationService = inject(ToastrService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private modal = inject(ModalService);
  private fb = inject(FormBuilder);
  private auditLog = inject(AuditLogService);
  private confirm = inject(ConfirmDialogService);
  private employeeService = inject(EmployeeService);

  canInvoice = false;
  openingInvoice = false;
  invoiceDn: any = null;
  private customerInvoices = inject(CustomerInvoiceService);
  private invoicePdf = inject(InvoiceService);
  deliveryNote: DeliveryNote | null = null;
  deliveryItems: any[] = [];
  isLoading = true;
  isDispatching = false;

  // view model — rebuilt by rebuildView() on every load
  panelOpen = true;
  panelTab: PanelTab = 'pricing';
  // stable array: a getter that builds a new one each change detection re-creates the buttons and swallows clicks
  readonly panelTabs: { id: PanelTab; label: string }[] = [
    { id: 'pricing', label: 'Pricing' },
    { id: 'documents', label: 'Documents' },
    { id: 'history', label: 'History' },
  ];

  subtitle = '';
  statusState: { dot: string; text: string } | null = null;
  priceGroups: { title: string; rows: { label: string; value: string }[] }[] = [];
  summaryStats: { label: string; value: string }[] = [];
  private detailFacts: DnFact[] = [];
  detailItems: DetailFieldsMenuItem[] = [];
  hiddenDetail = new Set<string>();
  detailOrder: string[] = [];
  get visibleDetail(): DnFact[] {
    const pos = (k: string) => { const i = this.detailOrder.indexOf(k); return i < 0 ? this.detailOrder.length : i; };
    return this.detailFacts.filter((f) => !this.hiddenDetail.has(f.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }
  trackFact = (_: number, f: DnFact) => f.label;
  deliveryFacts: DnFact[] = [];
  instructions = '';
  podFacts: DnFact[] = [];
  podRemarks = '';
  rejectionFacts: DnFact[] = [];
  poFacts: DnFact[] = [];
  grnFacts: DnFact[] = [];
  itemColumns: DetailTableColumn[] = [];
  itemRows: Record<string, any>[] = [];
  itemFootRows: DetailFootRow[] = [];
  documents: DetailDocument[] = [];
  history: DetailTimelineEntry[] = [];

  constructor() {
    this.employeeService.employeeData$.pipe(takeUntilDestroyed()).subscribe(emp => {
      this.canInvoice = (/^(superadmin|admin)$/i.test(emp?.category?.role ?? '') || !!(emp?.category?.privileges?.dispatch?.createInvoice ?? emp?.category?.privileges?.invoice?.createInvoice));
    });
    this.loadDeliveryNote();
  }

  loadDeliveryNote() {
    const dnId = this.route.snapshot.paramMap.get('id');
    if (!dnId) {
      this.notificationService.error('Invalid Delivery Note ID');
      this.router.navigate(['/dispatch']);
      return;
    }

    this.dnService.getDnById(dnId).subscribe({
      next: (response) => {
        this.deliveryNote = response;
        this.deliveryItems = (response.items || []).filter((item: any) => item.currentDeliveryQty > 0);
        this.rebuildView();
        this.isLoading = false;
        this.loadInvoiceState(dnId);
      },
      error: (error) => {
        this.notificationService.error('Failed to load delivery note details');
        console.error('Error loading delivery note:', error);
        this.isLoading = false;
        this.router.navigate(['/dispatch']);
      }
    });
  }

  onEdit() {
    if (!this.deliveryNote) return;
    this.editOpen = true;
  }

  editOpen = false;

  onEditSaved(): void {
    this.loadDeliveryNote();
  }

  /** Whether this DN already has a customer invoice; hides Create Invoice once one exists. */
  hasInvoice = false;
  /** The DN's existing invoice (when there is one); drives the Edit Invoice drawer. */
  invoice: any = null;
  editingInvoice: any = null;

  /** Only a still-pending invoice can be edited. */
  canEditInvoice(): boolean {
    return this.canInvoice && !!this.invoice?._id && this.invoice.status === 'Pending' && (this.invoice.paymentMethod !== 'PDC' || !this.invoice.pdcStatus || this.invoice.pdcStatus === 'Pending');
  }

  openEditInvoice(): void {
    if (!this.deliveryNote?._id || !this.invoice || this.openingInvoice) return;
    this.openingInvoice = true;
    this.customerInvoices.prepareDn(this.deliveryNote._id).subscribe({
      next: (response: any) => {
        this.openingInvoice = false;
        this.invoiceDn = response?.success ? response.data : response;
        this.editingInvoice = this.invoice;
      },
      error: (error) => {
        this.openingInvoice = false;
        this.notificationService.error(error?.error?.message || 'Failed to load the invoice for editing');
      },
    });
  }

  onInvoiceClosed(): void {
    this.invoiceDn = null;
    this.editingInvoice = null;
  }

  private loadInvoiceState(dnId: string): void {
    this.customerInvoices.list({ page: 1, limit: 1, search: '', deliveryNote: dnId }).subscribe({
      next: (res) => { this.hasInvoice = (res?.total ?? res?.data?.length ?? 0) > 0; this.invoice = res?.data?.[0] || null; },
      error: () => { this.hasInvoice = false; this.invoice = null; },
    });
  }

  /** Offered from DN creation (Ready to Deliver) until it is invoiced or delivered. */
  canCreateInvoice(): boolean {
    return this.canInvoice && !this.hasInvoice && ['Ready to Deliver', 'Dispatched'].includes(this.deliveryNote?.status || '');
  }

  openCreateInvoice(): void {
    if (!this.deliveryNote?._id || this.openingInvoice) return;
    this.openingInvoice = true;
    this.customerInvoices.prepareDn(this.deliveryNote._id).subscribe({
      next: (response: any) => {
        this.openingInvoice = false;
        this.invoiceDn = response?.success ? response.data : response;
      },
      error: (error) => {
        this.openingInvoice = false;
        this.notificationService.error(error?.error?.message || 'Failed to load the delivery note for invoicing');
      },
    });
  }

  onInvoiceSaved(invoice: any): void {
    const edited = !!this.editingInvoice;
    this.invoiceDn = null;
    this.editingInvoice = null;
    this.hasInvoice = true;
    this.invoice = invoice;
    if (this.deliveryNote?._id) this.auditLog.getHistory('deliveryNote', this.deliveryNote._id).subscribe({ next: (e) => { if (e?.length) this.history = toTimelineEntries(e); }, error: () => {} });
    this.notificationService.success(`Customer invoice ${invoice?.invoiceNo || ''} ${edited ? 'updated' : 'created'}`.replace('  ', ' '));
  }

  /** Place Order confirms, then dispatches the DN (stock leaves the warehouse). */
  async onDispatch(): Promise<void> {
    if (!this.deliveryNote?._id || this.deliveryNote.status !== 'Ready to Deliver') return;
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: 'Place order?',
      message: 'The delivery note will be dispatched and its stock taken out of the warehouse.',
      details: [{ label: 'Delivery note', value: this.deliveryNote.dnNo }],
      confirmLabel: 'Place order',
    });
    if (!confirmed) return;
    this.isDispatching = true;
    this.dnService.dispatchDn(this.deliveryNote._id).subscribe({
      next: () => {
        this.notificationService.success('Order placed; delivery note dispatched');
        this.isDispatching = false;
        this.loadDeliveryNote();
      },
      error: (error) => {
        this.notificationService.error(error.error?.message || 'Failed to dispatch delivery');
        this.isDispatching = false;
      }
    });
  }

  onBack() {
    this.router.navigate(['/dispatch']);
  }

  closedPurchaseOrders(dn: DeliveryNote): any[] {
    return this.latestLinkedRecords(
      dn.linkedRecords?.purchaseOrders?.filter((po: any) => po.poStatus === 'Closed') || [],
      'poDate'
    );
  }

  passedGrns(dn: DeliveryNote): any[] {
    return this.latestLinkedRecords(
      dn.linkedRecords?.grns?.filter((grn: any) =>
        [grn.inspectionResult, grn.outcomeStatus].some((status) => String(status || '').toLowerCase() === 'passed')
      ) || [],
      'grnDate'
    );
  }

  canCompletePod(): boolean {
    return this.deliveryNote?.status === 'Dispatched';
  }

  /** Same delivery-confirmation modal the DN register uses. */
  openPod(): void {
    const dn = this.deliveryNote;
    if (!dn?._id) return;
    const data: ConfirmDeliveryData = { id: dn._id, dnNo: dn.dnNo, clientName: dn.clientName };
    this.modal.open<boolean>(ConfirmDeliveryModalComponent, { data, width: '560px' })
      .afterClosed().subscribe(done => { if (done) this.loadDeliveryNote(); });
  }

  /** Preview or download the customer invoice raised against this DN. */
  renderInvoice(download: boolean): void {
    const dn = this.deliveryNote;
    if (!dn?._id) return;
    this.dnService.getDnInvoice(dn._id).subscribe({
      next: (response: any) => {
        const invoice = response?.data;
        if (!invoice) {
          this.notificationService.error('Invoice details are not available');
          return;
        }
        this.invoicePdf.generateInvoicePDF(invoice)
          .then((pdf) => download
            ? pdf.download(`${invoice.invoiceNo || `invoice-${dn.dnNo}`}.pdf`)
            : pdf.getBlob((blob: Blob) => this.dialog.open(PdfPreviewComponent, {
              height: '90vh',
              maxWidth: '1200px',
              data: { url: window.URL.createObjectURL(blob), formatedQuote: invoice, type: 'invoice' },
            })))
          .catch(() => this.notificationService.error('Failed to generate the invoice PDF'));
      },
      error: () => this.notificationService.error('Failed to load the invoice details'),
    });
  }

  readonly dnPdfItems: ActionMenuItem[] = [
    { id: 'dn-preview', label: 'Preview', icon: 'heroEye' },
    { id: 'dn-download', label: 'Download', icon: 'heroArrowDownTray' },
  ];
  get invoicePdfItems(): ActionMenuItem[] {
    const items: ActionMenuItem[] = [
      { id: 'inv-preview', label: 'Preview invoice', icon: 'heroEye' },
      { id: 'inv-download', label: 'Download invoice', icon: 'heroArrowDownTray' },
    ];
    return items;
  }

  onPdfMenu(id: string): void {
    switch (id) {
      case 'dn-preview': this.onPreview(); break;
      case 'dn-download': this.onDownload(); break;
      case 'inv-edit': this.openEditInvoice(); break;
      case 'inv-preview': this.renderInvoice(false); break;
      case 'inv-download': this.renderInvoice(true); break;
    }
  }

  async onDownload() {
    if (!this.deliveryNote) return;
    try {
      const pdfDoc = await this.dnService.generatePDF(this.deliveryNote, true);
      pdfDoc.download(`${this.deliveryNote.dnNo || 'delivery-note'}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.notificationService.error('Failed to generate the delivery note PDF');
    }
  }

  async onPreview() {
    if (!this.deliveryNote) return;

    try {
      const pdfDoc = await this.dnService.generatePDF(this.deliveryNote, true);
      pdfDoc.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.dialog.open(PdfPreviewComponent, {
          height: '90vh',
          maxWidth: '1200px',
          data: {
            url: url,
            formatedQuote: this.deliveryNote,
            type: 'delivery-note'
          }
        });
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.notificationService.error('Failed to generate PDF preview');
    }
  }

  private state(value: string): { dot: string; text: string } {
    const tone = DETAIL_TONE[STATUS_TONES[value] ?? 'neutral'];
    return { dot: tone.dot, text: tone.text };
  }

  /** The shell takes new-array inputs, so everything it shows is built once per load. */
  private rebuildView(): void {
    const dn = this.deliveryNote;
    if (!dn) return;
    const job: any = dn.jobId;
    const items = this.deliveryItems;
    const sum = (pick: (i: any) => number) => items.reduce((total, i) => total + (pick(i) || 0), 0);
    const ordered = sum((i) => i.orderedQty);
    const previous = sum((i) => i.deliveredQty);
    const current = sum((i) => i.currentDeliveryQty);
    const creator = this.employeeName(dn.createdBy);

    this.subtitle = [dn.clientName, job?.projectName || dn.subject].filter(Boolean).join(' · ');
    this.statusState = this.state(dn.status);

    const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const p = (dn as any).priceSummary || {};
    this.summaryStats = [
      { label: 'Job total', value: money(p.jobTotal || 0) },
      { label: 'Job discount', value: money(p.jobDiscount || 0) },
      { label: 'Job net total', value: money(p.jobNet || 0) },
      { label: 'DN total', value: money(p.dnTotal || 0) },
      { label: 'DN discount', value: money(p.dnDiscount || 0) },
      { label: 'DN net total', value: money(p.dnNet || 0) },
    ];
    this.priceGroups = [
      { title: 'This delivery note', rows: [
        { label: 'Total price', value: money(p.dnTotal || 0) },
        { label: 'Total discount', value: money(p.dnDiscount || 0) },
        { label: 'Net total', value: money(p.dnNet || 0) },
      ] },
      { title: 'Covered (delivered so far)', rows: [
        { label: 'Delivered total', value: money(p.coveredTotal || 0) },
        { label: 'Delivered discount', value: money(p.coveredDiscount || 0) },
        { label: 'Delivered net total', value: money(p.coveredNet || 0) },
      ] },
      { title: 'Job sheet', rows: [
        { label: 'Total', value: money(p.jobTotal || 0) },
        { label: 'Discount', value: money(p.jobDiscount || 0) },
        { label: 'Net total', value: money(p.jobNet || 0) },
      ] },
    ];

    const grns: any[] = this.passedGrns(dn);
    const grnList = grns.map((g) => g.grnNo || '-').join(', ');
    this.detailFacts = [
      { label: 'DN Date', value: this.formatDate(dn.dnDate) },
      { label: 'Job ID', value: job?.jobId || '-', link: job?._id && job?.jobId ? ['/job-sheet/view', job._id] : undefined },
      { label: 'GRN', value: grns.length ? grnList : '-' },
      { label: 'Customer', value: dn.clientName || '-' },
      { label: 'Customer PO', value: dn.customerLpoNumber || '-' },
      { label: 'Status', value: dn.status, state: this.state(dn.status) },
      { label: 'Created By', value: creator || '-' },
      { label: 'Delivery Type', value: dn.deliveryType || 'Customer Delivery' },
      { label: 'Ship To', value: dn.shipToName || dn.clientName || '-' },
      { label: 'Address', value: dn.shipToAddress || '-' },
      { label: 'Contact Person', value: dn.contactPerson || '-' },
      { label: 'Contact No', value: dn.contactNo || '-' },
      { label: 'Instructions', value: dn.deliveryInstructions || '-' },
    ];
    const hidden: string[] = [];
    this.detailItems = this.detailFacts.map((f) => ({ key: f.label, label: f.label, hiddenByDefault: hidden.includes(f.label) }));

    this.deliveryFacts = [
      { label: 'Type', value: dn.deliveryType || 'Customer Delivery' },
      { label: 'Ship To', value: dn.shipToName || dn.clientName || '-' },
      { label: 'Address', value: dn.shipToAddress || '-' },
      { label: 'Contact Person', value: dn.contactPerson || '-' },
      { label: 'Contact No', value: dn.contactNo || '-' },
    ];
    this.instructions = dn.deliveryInstructions || '';

    this.podFacts = dn.pod?.receivedBy ? [
      { label: 'Received By', value: dn.pod.receivedBy },
      { label: 'Contact No', value: dn.pod.receivedContactNo || '-' },
      { label: 'Received On', value: this.formatDate(dn.pod.receivedDate) },
      { label: 'Signature Name', value: dn.pod.signatureName || '-' },
      { label: 'Delivered By', value: this.employeeName(dn.pod.deliveredBy) || '-' },
    ] : [];
    this.podRemarks = dn.pod?.remarks || '';
    this.rejectionFacts = (dn.rejectedHistory || []).map((r) => ({
      label: this.formatDate(r.date),
      value: [r.reason || 'No reason given', this.employeeName(r.rejectedBy)].filter(Boolean).join(' · '),
    }));

    this.poFacts = this.closedPurchaseOrders(dn).map((po: any) => ({
      label: po.poNo || '-',
      value: [po.supplierId?.supplierName, this.formatDate(po.poDate)].filter(Boolean).join(' · '),
      link: ['/purchase-order/view-lpo', po._id],
    }));
    this.grnFacts = this.passedGrns(dn).map((grn: any) => ({
      label: grn.grnNo || '-',
      value: this.formatDate(grn.grnDate),
    }));

    this.itemColumns = [
      { key: 'detail', label: 'Description', truncate: true, tooltipKey: 'detail' },
      { key: 'itemCode', label: 'Item Code', hiddenByDefault: true },
      { key: 'partNo', label: 'Part No', hiddenByDefault: true },
      { key: 'orderedQty', label: 'Total qty', type: 'number', align: 'right' },
      { key: 'currentQty', label: 'Delivering', type: 'number', align: 'right' },
      { key: 'deliveredQty', label: 'Delivered', type: 'number', align: 'right' },
      { key: 'price', label: 'Price', type: 'currency', align: 'right' },
      { key: 'serials', label: 'Serial nos', truncate: true, hiddenByDefault: !items.some((i) => i.serialNos?.length) },
      { key: 'itemStatus', label: 'Status', type: 'badge', hiddenByDefault: true, badgeTones: { 'Pending': 'warn', 'Partially Delivered': 'info', 'Delivered': 'good', 'No PO / Not in Inventory': 'bad' } },
    ];
    this.itemRows = items.map((i: any) => ({
      detail: i.description || '-',
      itemCode: i.itemCode || '-',
      partNo: i.partNo || '-',
      serials: Array.isArray(i.serialNos) && i.serialNos.length ? i.serialNos.join(', ') : '-',
      orderedQty: i.orderedQty || 0,
      currentQty: i.currentDeliveryQty || 0,
      deliveredQty: i.deliveredQty || 0,
      price: Number(i.unitSellingPrice) || 0,
      itemStatus: i.status || '-',
    }));
    this.itemFootRows = [
      { label: 'Total', cells: { price: { value: Number(p.dnTotal) || 0, format: 'currency' } } },
      { label: 'Discount', cells: { price: { value: Number(p.dnDiscount) || 0, format: 'currency' } } },
      { label: 'Net total', emphasis: true, cells: { price: { value: Number(p.dnNet) || 0, format: 'currency' } } },
    ];

    this.documents = (dn.pod?.attachments || []).map((file, index) => ({
      id: `${file.fileName || file.originalname}-${index}`,
      name: file.originalname || file.fileName,
      date: dn.pod?.receivedDate || dn.updatedDate || dn.createdDate,
      uploadedBy: 'Proof of Delivery',
    }));

    const derivedHistory: DetailTimelineEntry[] = [
      { text: 'Delivery note created', meta: [creator, this.formatDateTime(dn.createdDate)].filter(Boolean).join(' · '), tone: 'info' as const },
      ...(dn.status !== 'Draft' ? [{ text: `Status: ${dn.status}`, meta: this.formatDateTime(dn.updatedDate || dn.createdDate), tone: dn.status === 'Cancelled' ? 'bad' as const : 'good' as const }] : []),
      ...(dn.rejectedHistory || []).map((entry) => ({
        text: entry.reason ? `Delivery rejected: ${entry.reason}` : 'Delivery rejected',
        meta: this.formatDateTime(entry.date),
        tone: 'bad' as const,
      })),
      ...(dn.pod?.receivedBy ? [{ text: `Proof of delivery captured by ${dn.pod.receivedBy}`, meta: this.formatDateTime(dn.pod.receivedDate || dn.updatedDate), tone: 'good' as const }] : []),
    ].filter((entry) => !!entry.meta);
    // Recorded events win; DNs from before logging keep the timeline derived from their fields.
    this.history = derivedHistory;
    this.auditLog.getHistory('deliveryNote', dn._id).subscribe({
      next: (e) => { if (e?.length) this.history = toTimelineEntries(e); },
      error: () => { /* keep the derived timeline */ },
    });
  }

  private employeeName(employee: any): string {
    if (!employee || typeof employee === 'string') return '';
    return `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  }

  private formatDate(value?: string | Date): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private formatDateTime(value?: string): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  private latestLinkedRecords(records: any[], dateKey: string): any[] {
    return [...records]
      .sort((left, right) => new Date(right?.[dateKey] || 0).getTime() - new Date(left?.[dateKey] || 0).getTime())
      .slice(0, 3);
  }
}
