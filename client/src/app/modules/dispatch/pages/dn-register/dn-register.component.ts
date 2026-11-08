import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import { ToastrService } from 'ngx-toastr';

import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { DeliveryNote, DnStatus } from 'src/app/shared/interfaces/delivery-note.interface';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridDetailTab, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailDocument, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { CreateDnComponent } from '../create-dn/create-dn.component';
import { CustomerInvoiceFormComponent } from 'src/app/modules/finance/pages/vendor-bills/customer-invoice-form.component';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { InvoiceService } from 'src/app/core/services/invoice.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ConfirmDeliveryDrawerComponent } from '../../components/confirm-delivery-drawer/confirm-delivery-drawer.component';
import { ReturnDnDrawerComponent } from '../../components/return-dn-drawer/return-dn-drawer.component';

interface FilterParams {
  [key: string]: any;
  page: number;
  row: number;
  search?: string;
  customer?: string;
  fromDate?: string;
  toDate?: string;
  status?: string | string[];
  jobId?: string;
  deliveryScope?: 'partial' | 'full';
}

@Component({
  selector: 'app-dn-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DataGridComponent,
    ActionButtonComponent,
    DetailDocumentsComponent,
    DetailTimelineComponent,
    DetailFieldComponent,
    DetailSectionComponent,
    DetailTableComponent,
    CreateDnComponent,
    CustomerInvoiceFormComponent,
    ConfirmDeliveryDrawerComponent,
    ReturnDnDrawerComponent,
    IconsModule,
    MatMenuModule
  ],
  templateUrl: './dn-register.component.html',
  styleUrl: './dn-register.component.css',
  providers: [PaginationService]
})
export class DnRegisterComponent implements OnInit, OnDestroy {
  @ViewChild('grid') grid!: DataGridComponent<DeliveryNote>;

  private _dnService = inject(DeliveryNoteService);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _dialog = inject(MatDialog);
  private modal = inject(ModalService);
  private toaster = inject(ToastrService);
  paginationService = inject(PaginationService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();
  private auditLog = inject(AuditLogService);
  private confirmDialog = inject(ConfirmDialogService);
  private historyCache = new Map<string, BehaviorSubject<DetailTimelineEntry[]>>();

  canCreateDn = signal<boolean>(false);
  canInvoice = false;
  openingInvoice = false;
  invoiceDn: any = null;
  private invoicedDnIds = new Set<string>();
  private customerInvoices = inject(CustomerInvoiceService);
  private invoiceService = inject(InvoiceService);

  tableData = signal<DeliveryNote[]>([]);
  tableColumns: DataGridColumn<DeliveryNote>[] = [];
  rowActions: DataGridRowAction<DeliveryNote>[] = [];
  views: DataGridView<DeliveryNote>[] = [
    { id: 'all', label: 'All' },
    { id: 'ready', label: 'Ready for DN' },
    { id: 'ready-to-deliver', label: 'Ready to Deliver', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.READY_TO_DELIVER }] },
    { id: 'out-for-delivery', label: 'Out for Delivery', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.DISPATCHED }] },
    // Both split Delivered DNs server-side (deliveryScope) by whether every line reached its ordered qty.
    { id: 'partially-delivered', label: 'Partially Delivered', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.DELIVERED }] },
    { id: 'fully-delivered', label: 'Fully Delivered', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.DELIVERED }] },
    { id: 'rejected', label: 'Rejected', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.REJECTED }, { id: 2, key: 'status', op: 'is', value: DnStatus.PARTIALLY_REJECTED }] },
    { id: 'cancelled', label: 'Cancelled', filters: [{ id: 1, key: 'status', op: 'is', value: DnStatus.CANCELLED }] },
  ];
  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Dispatch' }, { label: 'Delivery Notes' }];
  readonly detailTabs: DataGridDetailTab[] = [
    { id: 'overview', label: 'Details', icon: 'info' },
    { id: 'items', label: 'Items', icon: 'card' },
    { id: 'documents', label: 'Documents', icon: 'files' },
    { id: 'history', label: 'History', icon: 'history' },
  ];

  isLoading = signal<boolean>(true);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);

  dnStatuses = Object.values(DnStatus);
  searchQuery = signal<string>('');
  private activeFilters: Partial<FilterParams> = {};
  activeViewId = 'all';
  private requestSequence = 0;
  private countRequestSequence = 0;
  formOpen = false;
  formEditId: string | null = null;
  formJobId: string | null = null;

  ngOnInit(): void {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe(emp => {
        this.canInvoice = (/^(superadmin|admin)$/i.test(emp?.category?.role ?? '') || !!(emp?.category?.privileges?.dispatch?.createInvoice ?? emp?.category?.privileges?.invoice?.createInvoice));
        const privileges = emp?.category?.privileges?.dispatch;
        if (privileges?.createDeliveryNote) {
          this.canCreateDn.set(true);
          if (this.activeViewId === 'ready') this.setupReadyActions();
        }
      })
    );
    this.setupTableColumns();
    this.setupRowActions();
    this.initializeFromUrlParams();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  initializeFromUrlParams(): void {
    this._route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : 1;
      const row = params['row'] ? parseInt(params['row']) : 10;
      const search = params['search'] || '';
      const customer = params['customer'] || '';
      const status = params['status'] || '';
      const jobId = params['jobId'] || '';
      const fromDate = params['fromDate'] || '';
      const toDate = params['toDate'] || '';

      this.paginationService.updatePaginationState({
        page,
        row,
        total: this.totalItems()
      });

      if (search) this.searchQuery.set(search);

      // URL synchronization runs after each server response. Keep the active tab criteria so
      // that the route emission cannot replace a filtered result with the unfiltered DN list.
      this.loadData(this.activeFilters);
      this.refreshViewCounts(search);
    });
  }

  setupTableColumns(): void {
    const baseColumns: DataGridColumn<DeliveryNote>[] = [
      {
        key: 'dnDate',
        label: 'DN Date',
        type: 'date',
        sortable: true,
        width: '120px'
      },
      {
        key: 'dnNo',
        label: 'DN No',
        sortable: true
      },
      {
        key: 'job.jobId',
        label: 'Job ID',
        valueGetter: (item) => item.job?.jobId || 'N/A'
      },
      {
        key: 'subject',
        label: 'Subject',
        valueGetter: (item: any) => item.quote?.subject || item.subject || '-'
      },
      {
        key: 'clientName',
        label: 'Customer',
      },
      { key: 'grnNumbers', label: 'GRN No', valueGetter: (item: any) => (item.grnNumbers || []).join(', ') || '-' },
      {
        key: 'customerLpoNumber',
        label: 'LPO Ref',
        valueGetter: (item) => item.customerLpoNumber || 'N/A'
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        editorOptions: this.dnStatuses.map(status => ({ label: status, value: status }))
      }
    ];

    this.tableColumns = baseColumns;
  }

  private setupReadyColumns(): void {
    this.tableColumns = [
      { key: 'grnNo', label: 'GRN No', valueGetter: (row: any) => row.grnNo || '-' },
      { key: 'grnDate', label: 'GRN Date', type: 'date' },
      { key: 'job.jobId', label: 'Job ID', valueGetter: (row: any) => row.job?.jobId || 'N/A' },
      { key: 'clientName', label: 'Customer', valueGetter: (row: any) => row.clientName || '-' },
      { key: 'customerPoNumber', label: 'Customer PO', valueGetter: (row: any) => row.customerPoNumber || '-' },
      { key: 'subject', label: 'Subject', valueGetter: (row: any) => row.subject || '-' },
      { key: 'prNo', label: 'PR No', valueGetter: (row: any) => row.prNo || '-' },
      { key: 'poNo', label: 'PO No', valueGetter: (row: any) => row.poNo || '-' },
      { key: 'receivedQty', label: 'Received', type: 'number', align: 'right' },
      { key: 'deliveryStatus', label: 'Status', type: 'badge', valueGetter: (row: any) => row.deliveryStatus || '-' },
    ];
  }

  setupRowActions(): void {
    this.rowActions = [
      { id: 'viewDn', label: 'Detail view', icon: 'eye', quick: true, panel: true },
      { id: 'editDn', label: 'Edit DN', icon: 'edit', hidden: row => row.status !== DnStatus.DRAFT && row.status !== DnStatus.READY_TO_DELIVER },
      { id: 'placeOrder', label: 'Place order', icon: 'check', quick: true, hidden: row => row.status !== DnStatus.READY_TO_DELIVER },
      { id: 'confirmDelivery', label: 'Confirm delivery', icon: 'check', quick: true, hidden: row => row.status !== DnStatus.DISPATCHED },
      { id: 'returnDn', label: 'Return', icon: 'close', quick: true, variant: 'danger', hidden: row => !this.canReturn(row) },
      { id: 'previewDn', label: 'Preview DN', icon: 'files', quick: true },
      { id: 'downloadDn', label: 'Download DN', icon: 'download' },
      { id: 'editInvoice', label: 'Edit invoice', icon: 'edit', hidden: row => !this.canInvoice || !this.hasInvoice(row) },
      { id: 'createInvoice', label: 'Create invoice', icon: 'plus', quick: true, hidden: row => !this.canCreateInvoice(row) },
      { id: 'previewInvoice', label: 'Preview invoice', icon: 'customerBill', quick: true, hidden: row => !this.hasInvoice(row) },
      { id: 'downloadInvoice', label: 'Download invoice', icon: 'download', hidden: row => !this.hasInvoice(row) },
    ];
  }

  private setupReadyActions(): void {
    this.rowActions = this.canCreateDn()
      ? [{ id: 'createDn', label: 'Create DN', icon: 'plus', quick: true, persistent: true }]
      : [];
  }

  loadData(filters?: Partial<FilterParams>): void {
    this.isLoading.set(true);
    this.historyCache.clear();
    const requestId = ++this.requestSequence;
    const paginationState = this.paginationService.paginationState();

    const filterParams: FilterParams = {
      page: paginationState.page,
      row: paginationState.row,
      search: this.searchQuery() || undefined,
      ...filters
    };
    this.activeFilters = { ...filters };

    if (this.activeViewId === 'ready') {
      this.subscriptions.add(
        this._dnService.getReadyForDnReceipts({
          page: paginationState.page,
          row: paginationState.row,
          search: filterParams.search
        }).subscribe({
          next: response => {
            if (requestId !== this.requestSequence) return;
            this.tableData.set(response.grns || []);
            this.totalItems.set(response.total || 0);
            this.paginationService.updatePaginationState({ page: paginationState.page, row: paginationState.row, total: response.total || 0 });
            this.isEmpty.set(this.tableData().length === 0);
            this.isLoading.set(false);
          },
          error: error => {
            if (requestId !== this.requestSequence) return;
            this.toaster.error('Failed to load GRNs ready for DN');
            console.error('Error loading GRNs ready for DN:', error);
            this.isLoading.set(false);
            this.isEmpty.set(true);
          }
        })
      );
      return;
    }

    this.subscriptions.add(
      this._dnService.getAllDeliveryNotes(filterParams).subscribe({
        next: (response) => {
          if (requestId !== this.requestSequence) return;
          this.tableData.set(response.dns || []);
          this.totalItems.set(response.total || 0);

          this.paginationService.updatePaginationState({
            page: paginationState.page,
            row: paginationState.row,
            total: response.total || 0
          });

          this.isEmpty.set(this.tableData().length === 0);
          this.isLoading.set(false);
          this.updateUrlParams();
        },
        error: (error) => {
          if (requestId !== this.requestSequence) return;
          this.toaster.error('Failed to load delivery notes');
          console.error('Error loading delivery notes:', error);
          this.isLoading.set(false);
          this.isEmpty.set(true);
        }
      })
    );
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadData(this.activeFilters);
  }

  onQueryChange(query: DataGridQuery): void {
    this.isLoading.set(true);
    this.searchQuery.set(query.search || '');
    this.paginationService.updatePaginationState({
      page: query.page,
      row: query.pageSize,
      total: this.totalItems()
    });

    this.activeViewId = query.viewId || 'all';
    if (this.activeViewId === 'ready') {
      this.setupReadyColumns();
      this.setupReadyActions();
    } else {
      this.setupTableColumns();
      this.setupRowActions();
    }

    const filterParams: Partial<FilterParams> = {};
    if (query.search) filterParams.search = query.search;
    const statusValues: string[] = [];
    query.filters.forEach(filter => {
      if (filter.key === 'dnNo') filterParams.search = filter.value;
      else if (filter.key === 'job.jobId') filterParams.jobId = filter.value;
      else if (filter.key === 'clientName') filterParams.customer = filter.value;
      else if (filter.key === 'status') statusValues.push(filter.value);
      else if (filter.key === 'dnDate') {
        if (filter.op === 'on') {
          filterParams.fromDate = filter.value;
          filterParams.toDate = filter.value;
        }
      }
    });
    if (query.viewId === 'ready-to-deliver') filterParams.status = DnStatus.READY_TO_DELIVER;
    if (query.viewId === 'out-for-delivery') filterParams.status = DnStatus.DISPATCHED;
    if (query.viewId === 'partially-delivered') {
      filterParams.status = DnStatus.DELIVERED;
      filterParams.deliveryScope = 'partial';
    }
    if (query.viewId === 'fully-delivered') {
      filterParams.status = DnStatus.DELIVERED;
      filterParams.deliveryScope = 'full';
    }
    if (query.viewId === 'rejected') filterParams.status = [DnStatus.REJECTED, DnStatus.PARTIALLY_REJECTED];
    if (query.viewId === 'cancelled') filterParams.status = DnStatus.CANCELLED;
    if (!filterParams.status && statusValues.length === 1) filterParams.status = statusValues[0];
    else if (!filterParams.status && statusValues.length > 1) filterParams.status = statusValues;

    this.loadData(filterParams);
    this.refreshViewCounts(query.search);
  }

  updateUrlParams(): void {
    const paginationState = this.paginationService.paginationState();
    const queryParams: any = {};

    queryParams.page = paginationState.page !== 1 ? paginationState.page : null;
    queryParams.row = paginationState.row !== 10 ? paginationState.row : null;
    queryParams.search = this.searchQuery() || null;

    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onRowAction(event: DataGridRowActionEvent<DeliveryNote>): void {
    const { action, row } = event;

    switch (action.id) {
      case 'viewDn':
        this.viewDnDetails(row);
        break;
      case 'createDn':
        this.openCreateDrawer(null, row.job?._id || row.jobId);
        break;
      case 'editDn':
        this.openCreateDrawer(row._id);
        break;
      case 'placeOrder':
        void this.placeOrder(row);
        break;
      case 'confirmDelivery':
        this.openConfirmDelivery(row);
        break;
      case 'returnDn':
        this.returnDnRow = row;
        break;
      case 'previewDn':
      case 'downloadDn':
        this.dnPdf(row, action.id === 'downloadDn');
        break;
      case 'createInvoice':
        this.openCreateInvoice(row);
        break;
      case 'editInvoice':
        this.openEditInvoice(row);
        break;
      case 'previewInvoice':
      case 'downloadInvoice':
        this.invoicePdf(row, action.id === 'downloadInvoice');
        break;
    }
  }

  hasInvoice(row: DeliveryNote): boolean {
    return this.invoicedDnIds.has(row._id) || !!(row as any).customerInvoiceNo;
  }

  /** Shapes the customer invoice raised for this DN like the invoice the PDF generator prints. */
  private invoicePdf(row: DeliveryNote, download: boolean): void {
    this.customerInvoices.list({ page: 1, limit: 1, search: '', deliveryNote: row._id }).subscribe({
      next: res => {
        const inv = res?.data?.[0];
        if (!inv) {
          this.toaster.error('Invoice details are not available');
          return;
        }
        const invoice = {
          invoiceNo: inv.invoiceNo,
          date: inv.invoiceDate,
          customer: { companyName: inv.client?.name },
          attention: inv.attention,
          jobId: { jobId: inv.jobNo },
          dnNumbers: inv.dnNo,
          lpoRef: inv.lpoRef,
          subject: inv.subject,
          paymentTerms: inv.paymentTerms,
          currency: inv.currency || 'QAR',
          amount: inv.amount,
          discount: inv.discount || 0,
          items: (inv.items || []).map((i: any) => ({ description: i.description, quantity: i.quantity, amount: i.totalCost })),
        };
        this.invoiceService.generateInvoicePDF(invoice, true)
          .then(pdf => download
            ? pdf.download(`${inv.invoiceNo || 'invoice'}.pdf`)
            : pdf.getBlob((blob: Blob) => this.openPreview(blob, invoice, 'invoice')))
          .catch(() => this.toaster.error('Failed to generate the invoice PDF'));
      },
      error: () => this.toaster.error('Failed to load the invoice details'),
    });
  }

  /** Offered from DN creation (Ready to Deliver) until it is invoiced or delivered. */
  canCreateInvoice(row: DeliveryNote): boolean {
    return this.canInvoice && !this.hasInvoice(row)
      && (row.status === DnStatus.READY_TO_DELIVER || row.status === DnStatus.DISPATCHED);
  }

  openCreateInvoice(row: DeliveryNote): void {
    if (this.openingInvoice) return;
    this.openingInvoice = true;
    this.customerInvoices.prepareDn(row._id).subscribe({
      next: (response: any) => {
        this.openingInvoice = false;
        this.invoiceDn = response?.success ? response.data : response;
      },
      error: (error) => {
        this.openingInvoice = false;
        this.toaster.error(error?.error?.message || 'Failed to load the delivery note for invoicing');
      },
    });
  }

  editingInvoice: any = null;

  /** Only a still-pending invoice can be edited (a PDC one only while its PDC is un-actioned). */
  openEditInvoice(row: DeliveryNote): void {
    if (this.openingInvoice) return;
    this.openingInvoice = true;
    this.customerInvoices.list({ page: 1, limit: 1, search: '', deliveryNote: row._id }).subscribe({
      next: res => {
        const inv = res?.data?.[0];
        const editable = !!inv?._id && inv.status === 'Pending'
          && (inv.paymentMethod !== 'PDC' || !inv.pdcStatus || inv.pdcStatus === 'Pending');
        if (!editable) {
          this.openingInvoice = false;
          this.toaster.error(inv ? 'This invoice can no longer be edited' : 'Invoice details are not available');
          return;
        }
        this.customerInvoices.prepareDn(row._id).subscribe({
          next: (response: any) => {
            this.openingInvoice = false;
            this.invoiceDn = response?.success ? response.data : response;
            this.editingInvoice = inv;
          },
          error: (error) => {
            this.openingInvoice = false;
            this.toaster.error(error?.error?.message || 'Failed to load the invoice for editing');
          },
        });
      },
      error: () => {
        this.openingInvoice = false;
        this.toaster.error('Failed to load the invoice details');
      },
    });
  }

  onInvoiceClosed(): void {
    this.invoiceDn = null;
    this.editingInvoice = null;
  }

  onInvoiceSaved(invoice: any): void {
    const wasEdit = !!this.editingInvoice;
    this.editingInvoice = null;
    if (wasEdit) {
      this.invoiceDn = null;
      this.toaster.success(`Customer invoice ${invoice?.invoiceNo || ''} updated`.replace('  ', ' '));
      return;
    }
    if (this.invoiceDn?._id) {
      const id = this.invoiceDn._id;
      this.invoicedDnIds.add(id);
      const subject = this.historyCache.get(id);
      if (subject) this.auditLog.getHistory('deliveryNote', id).subscribe({ next: (e) => { if (e?.length) subject.next(toTimelineEntries(e)); }, error: () => {} });
    }
    this.invoiceDn = null;
    this.toaster.success(`Customer invoice ${invoice?.invoiceNo || ''} created`.replace('  ', ' '));
  }

  viewDnDetails(dn: DeliveryNote): void {
    this._router.navigate(['/dispatch/view', dn._id]);
  }

  /** Place Order confirms, then dispatches the DN (stock leaves the warehouse). */
  async placeOrder(row: DeliveryNote): Promise<void> {
    if (row.status !== DnStatus.READY_TO_DELIVER) return;
    const { confirmed } = await this.confirmDialog.open({
      tone: 'approve',
      title: 'Place order?',
      message: 'The delivery note will be dispatched and its stock taken out of the warehouse.',
      details: [{ label: 'Delivery note', value: row.dnNo }],
      confirmLabel: 'Place order',
    });
    if (!confirmed) return;
    this._dnService.dispatchDn(row._id).subscribe({
      next: () => {
        this.toaster.success('Order placed; delivery note dispatched');
        this.loadData(this.activeFilters);
        this.refreshViewCounts();
      },
      error: (error) => this.toaster.error(error?.error?.message || 'Failed to dispatch delivery'),
    });
  }

  deliveryDn: DeliveryNote | null = null;
  returnDnRow: DeliveryNote | null = null;

  /** A delivered note (or one already partly returned) with quantity still left to send back. */
  canReturn(row: DeliveryNote): boolean {
    return (row.status === DnStatus.DELIVERED || row.status === DnStatus.PARTIALLY_REJECTED)
      && (row.items || []).some((i: any) => Number(i.currentDeliveryQty || i.deliveredQty || 0) > Number(i.rejectedQty || 0));
  }

  onReturnSaved(): void {
    this.returnDnRow = null;
    this.loadData(this.activeFilters);
    this.refreshViewCounts();
  }

  openConfirmDelivery(row: DeliveryNote): void {
    this.deliveryDn = row;
  }

  onDeliverySaved(): void {
    this.deliveryDn = null;
    this.loadData(this.activeFilters);
    this.refreshViewCounts();
  }

  /** The list row is thin, so the DN is loaded in full; the invoice no and payment terms come from the row's customer invoice. */
  private dnPdf(row: DeliveryNote, download: boolean): void {
    this._dnService.getDnById(row._id).subscribe({
      next: (res: any) => {
        const dn = res?.data || res;
        const data = {
          ...dn,
          invoiceNo: (row as any).customerInvoiceNo || '',
          paymentTerms: (row as any).customerInvoicePaymentTerms || '',
        };
        this._dnService.generatePDF(data, true)
          .then(pdf => download
            ? pdf.download(`${dn.dnNo || 'delivery-note'}.pdf`)
            : pdf.getBlob((blob: Blob) => this.openPreview(blob, data, 'delivery-note')))
          .catch(() => this.toaster.error('Failed to generate the DN PDF'));
      },
      error: () => this.toaster.error('Failed to load the delivery note'),
    });
  }

  private openPreview(blob: Blob, data: any, type: string): void {
    this._dialog.open(PdfPreviewComponent, {
      height: '90vh',
      maxWidth: '1200px',
      data: { url: window.URL.createObjectURL(blob), formatedQuote: data, type },
    });
  }

  dnTitle = (row: DeliveryNote): string => this.activeViewId === 'ready' ? ((row as any).job?.jobId || 'Ready for DN') : (row.dnNo || 'Delivery Note');
  dnSubtitle = (row: DeliveryNote): string => this.activeViewId === 'ready' ? ((row as any).clientName || '') : (row.clientName || '');
  dnRowOpenable = (): boolean => true;

  readonly readyDetailTabs: DataGridDetailTab[] = [
    { id: 'ready-details', label: 'Details', icon: 'info' },
    { id: 'ready-items', label: 'Items', icon: 'card' },
  ];

  readonly readyItemColumns: DetailTableColumn[] = [
    { key: 'name', label: 'Item Description', wrap: true },
    { key: 'totalQty', label: 'Total Qty', type: 'number', total: true },
    { key: 'receivedQty', label: 'Received Qty', type: 'number', total: true },
    { key: 'rejectedQty', label: 'Rejected Qty', type: 'number', total: true },
    { key: 'deliveredQty', label: 'Delivered Qty', type: 'number', total: true },
    { key: 'totalPrice', label: 'Total Price', type: 'number', total: true },
    { key: 'status', label: 'Status' },
  ];

  readonly readyJobItemColumns: DetailTableColumn[] = [
    { key: 'name', label: 'Item Description', truncate: true },
    { key: 'totalQty', label: 'Total Qty', type: 'number' },
    { key: 'dnQty', label: 'Delivery', type: 'number', tooltipKey: 'dnNos' },
    { key: 'deliveredQty', label: 'Delivered', type: 'number' },
    { key: 'totalCost', label: 'Cost', type: 'number', total: true },
    { key: 'totalPrice', label: 'Price', type: 'number', total: true },
  ];

  /** All the job's items; those not on this GRN are muted and left out of the totals. */
  readyJobItemRows(row: any): Record<string, any>[] {
    const norm = (v: any) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const onGrn = new Set((row?.products || []).map((p: any) => norm(p.name)));
    return (row?.jobProducts || []).map((p: any) => ({
      name: p.name || '-',
      totalQty: p.totalQty || 0,
      deliveredQty: p.deliveredQty || 0,
      dnQty: p.dnQty || 0,
      dnNos: p.dnNos ? `On DN: ${p.dnNos}` : '',
      totalCost: p.totalCost || 0,
      totalPrice: p.totalPrice || 0,
      _excludeFromTotal: !onGrn.has(norm(p.name)),
    }));
  }

  openCreateDrawer(editId: string | null = null, jobId: string | null = null): void {
    this.formEditId = editId;
    this.formJobId = jobId;
    this.formOpen = true;
  }

  closeCreateDrawer(): void {
    this.formOpen = false;
    this.formEditId = null;
    this.formJobId = null;
  }

  onCreateSaved(): void {
    this.loadData(this.activeFilters);
    this.refreshViewCounts(this.searchQuery());
  }

  onSearchSubmit(searchTerm: string): void {
    this.searchQuery.set(searchTerm || '');
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.loadData(this.activeFilters);
    this.refreshViewCounts(searchTerm);
    this.updateUrlParams();
  }

  readonly itemColumns: DetailTableColumn[] = [
    { key: 'description', label: 'Description', wrap: true },
    { key: 'orderedQty', label: 'Qty', type: 'number', total: true },
    { key: 'unitPrice', label: 'Price', type: 'currency' },
    { key: 'amount', label: 'Total', type: 'currency', total: true },
  ];

  /** Total per line is qty x price; the footer sums those. */
  itemRows(row: DeliveryNote): Record<string, any>[] {
    return (row.items || []).map((item) => {
      const qty = item.orderedQty || 0;
      const unitPrice = item.unitSellingPrice || 0;
      return { description: item.description || '-', orderedQty: qty, unitPrice, amount: qty * unitPrice };
    });
  }

  /** Reference numbers for the job behind the DN, shown as a joined line. */
  linked(numbers?: string[]): string {
    return (numbers || []).join(', ') || '-';
  }

  rejectionReasons(row: DeliveryNote): string {
    return (row.items || []).filter((i) => i.rejectionReason).map((i) => `${i.partNo || i.description}: ${i.rejectionReason}`).join('; ') || '-';
  }

  detailDocuments(row: DeliveryNote): DetailDocument[] {
    return (row.pod?.attachments || []).map((file, index) => ({
      id: file.fileName || `${index}`,
      name: file.originalname || file.fileName,
      date: row.pod?.receivedDate || row.updatedDate || row.createdDate,
      uploadedBy: 'Proof of Delivery',
    }));
  }

  /** Recorded events when the DN has any; DNs from before logging keep the timeline derived from their fields. */
  historyFor(row: DeliveryNote): Observable<DetailTimelineEntry[]> {
    let subject = this.historyCache.get(row._id);
    if (!subject) {
      subject = new BehaviorSubject<DetailTimelineEntry[]>([]);
      this.historyCache.set(row._id, subject);
      this.auditLog.getHistory('deliveryNote', row._id).subscribe({
        next: (e) => subject!.next(e?.length ? toTimelineEntries(e) : this.detailHistory(row)),
        error: () => this.historyCache.delete(row._id),
      });
    }
    return subject.asObservable();
  }

  detailHistory(row: DeliveryNote): DetailTimelineEntry[] {
    const creator = row.createdBy ? `${row.createdBy.firstName || ''} ${row.createdBy.lastName || ''}`.trim() : '';
    return [
      { text: 'Delivery note created', meta: [creator, this.formatDateTime(row.createdDate)].filter(Boolean).join(' · '), tone: 'info' as const },
      ...(row.status !== DnStatus.DRAFT ? [{ text: `Status: ${row.status}`, meta: this.formatDateTime(row.updatedDate || row.createdDate), tone: row.status === DnStatus.CANCELLED ? 'bad' as const : 'good' as const }] : []),
      ...(row.rejectedHistory || []).map((entry) => ({
        text: entry.reason ? `Delivery rejected: ${entry.reason}` : 'Delivery rejected',
        meta: this.formatDateTime(entry.date),
        tone: 'bad' as const,
      })),
      ...(row.pod?.receivedBy ? [{ text: `Proof of delivery captured by ${row.pod.receivedBy}`, meta: this.formatDateTime(row.pod.receivedDate || row.updatedDate), tone: 'good' as const }] : []),
    ].filter((entry) => !!entry.meta);
  }

  private refreshViewCounts(search = this.searchQuery()): void {
    const requestId = ++this.countRequestSequence;
    const countRequest = (viewId: string) => {
      if (viewId === 'ready') {
        return this._dnService.getReadyForDnReceipts({ page: 1, row: 1, search: search || undefined })
          .pipe(map((response) => response.total || 0), catchError(() => of(undefined)));
      }
      return this._dnService.getAllDeliveryNotes({
        page: 1,
        row: 1,
        search: search || undefined,
        ...this.filtersForView(viewId),
      }).pipe(map((response) => response.total || 0), catchError(() => of(undefined)));
    };

    this.subscriptions.add(forkJoin(this.views.map((view) => countRequest(view.id))).subscribe((counts) => {
      if (requestId !== this.countRequestSequence) return;
      this.views = this.views.map((view, index) => ({
        ...view,
        count: counts[index],
        hideCount: counts[index] === undefined,
      }));
    }));
  }

  private filtersForView(viewId: string): Partial<FilterParams> {
    if (viewId === 'ready-to-deliver') return { status: DnStatus.READY_TO_DELIVER };
    if (viewId === 'out-for-delivery') return { status: DnStatus.DISPATCHED };
    if (viewId === 'partially-delivered') return { status: DnStatus.DELIVERED, deliveryScope: 'partial' };
    if (viewId === 'fully-delivered') return { status: DnStatus.DELIVERED, deliveryScope: 'full' };
    if (viewId === 'rejected') return { status: [DnStatus.REJECTED, DnStatus.PARTIALLY_REJECTED] };
    if (viewId === 'cancelled') return { status: DnStatus.CANCELLED };
    return {};
  }

  private formatDateTime(value?: string): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  }

  generateJobReport(): void {
    // For now, open dialog without pre-filtering
    // In future, can pass jobId from filters
    this.toaster.info('Please select a Job ID filter first');
  }

  generateCustomerReport(): void {
    // For now, open dialog without pre-filtering
    this.toaster.info('Please select a Customer filter first');
  }

  onExportRequest(): void {
    const total = this.totalItems();
    if (total === 0) {
      this.toaster.warning('No data to export');
      return;
    }

    const filterParams: FilterParams = {
      page: 1,
      row: total,
      search: this.searchQuery() || undefined,
      ...this.activeFilters
    };

    this._dnService.getAllDeliveryNotes(filterParams).subscribe({
      next: (response) => {
        if (response.dns.length > 0) {
          void this.grid.exportToExcel(response.dns);
        }
      },
      error: (error) => {
        this.toaster.error('Failed to export delivery notes');
        console.error('Error exporting delivery notes:', error);
      }
    });
  }
}
