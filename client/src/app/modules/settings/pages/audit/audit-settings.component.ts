import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuditLogEntry, AuditLogService } from 'src/app/core/services/audit-log.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridColumn, DataGridQuery, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { CustomerInvoiceService } from 'src/app/core/services/customer-invoice.service';
import { auditModuleLabel } from 'src/app/shared/utils/audit-timeline.util';

@Component({
  selector: 'app-audit-settings',
  standalone: true,
  imports: [CommonModule, DataGridComponent],
  templateUrl: './audit-settings.component.html',
  styleUrls: ['./audit-settings.component.css'],
})
export class AuditSettingsComponent implements OnInit {
  private auditLog = inject(AuditLogService);

  readonly limit = 25;
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly rowActions: DataGridRowAction<AuditLogEntry>[] = [
    { id: 'view', label: 'View details', icon: 'eye', quick: true, persistent: true, hidden: (row) => !this.target(row) },
  ];
  readonly columns: DataGridColumn<AuditLogEntry>[] = [
    { key: 'at', label: 'When', type: 'date', sortable: true, width: '170px', valueGetter: (row) => row.at },
    { key: 'entityType', label: 'Module', sortable: true, width: '150px', valueGetter: (row) => this.moduleLabel(row.entityType) },
    { key: 'action', label: 'Action', sortable: true, width: '170px', valueGetter: (row) => this.actionLabel(row.action) },
    { key: 'summary', label: 'Activity', sortable: true, locked: true },
    { key: 'actorName', label: 'User', sortable: true, width: '180px', valueGetter: (row) => row.actorName || '-' },
  ];

  rows: AuditLogEntry[] = [];
  entityTypes: string[] = [];
  views: DataGridView<AuditLogEntry>[] = [{ id: 'all', label: 'All', hideCount: true }];
  total = 0;
  loading = true;
  error = '';

  private query: DataGridQuery = {
    search: '',
    filters: [],
    sort: { key: null, direction: null },
    page: 1,
    pageSize: this.limit,
    viewId: 'all',
  };
  private requestSeq = 0;

  ngOnInit(): void {
    this.load();
  }

  private router = inject(Router);
  private invoices = inject(CustomerInvoiceService);

  /** Where the record behind an audit row lives; null when the module has no page to open. */
  private target(row: AuditLogEntry): { commands: any[]; queryParams?: Record<string, string> } | null {
    const id = row.entityId;
    const search = row.entityLabel ? { search: row.entityLabel } : undefined;
    switch (row.entityType) {
      case 'quotation': return { commands: [row.action?.startsWith('deal') ? '/deal-sheet/view' : '/quotations/view', id] };
      case 'job': return { commands: ['/job-sheet/view', id] };
      case 'purchaseOrder': return { commands: ['/purchase/view-lpo', id] };
      case 'grn': return { commands: ['/grn/view-grn', id] };
      case 'deliveryNote': return { commands: ['/dispatch/view', id] };
      case 'enquiry': return { commands: [/^presale|estimation|feedback|revision|to-presale/.test(row.action || '') ? '/presales' : '/enquiry'], queryParams: search };
      case 'customerInvoice': return { commands: ['/finance/invoices'] };
      case 'customer': return { commands: ['/customers'], queryParams: search };
      case 'supplier': return { commands: ['/suppliers'], queryParams: search };
      case 'product': return { commands: ['/products'], queryParams: search };
      case 'stock': return { commands: ['/stock/ledger'], queryParams: { product: id } };
      default: return null;
    }
  }

  onRowAction(event: DataGridRowActionEvent<AuditLogEntry>): void {
    const row = event.row;
    if (row.entityType === 'customerInvoice') {
      // Open by record id: the invoice's delivery note page, or the bills list when it has none.
      this.invoices.get(row.entityId).subscribe({
        next: (res) => this.router.navigate(res?.data?.deliveryNote ? ['/dispatch/view', res.data.deliveryNote] : ['/finance/invoices']),
        error: () => this.router.navigate(['/finance/invoices']),
      });
      return;
    }
    const target = this.target(row);
    if (target) this.router.navigate(target.commands, { queryParams: target.queryParams });
  }

  actionLabel(action: string): string {
    const text = (action || '').replace(/-/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
  }

  moduleLabel(type: string): string {
    return auditModuleLabel(type);
  }

  onQueryChange(query: DataGridQuery): void {
    this.query = query;
    this.load();
  }

  load(): void {
    const seq = ++this.requestSeq;
    this.loading = true;
    this.error = '';
    this.auditLog.list({
      page: this.query.page,
      limit: this.query.pageSize || this.limit,
      entityType: this.query.viewId === 'all' ? '' : this.query.viewId,
      search: this.query.search,
    }).subscribe({
      next: (res) => {
        if (seq !== this.requestSeq) return;
        this.rows = res.data;
        this.total = res.total;
        this.entityTypes = res.entityTypes;
        this.refreshViews();
        this.loading = false;
      },
      error: () => {
        if (seq !== this.requestSeq) return;
        this.loading = false;
        this.error = 'Could not load the activity log';
      },
    });
  }

  private refreshViews(): void {
    // Fixed tab order; any other recorded module is appended after these.
    const ordered = [
      'enquiry', 'presale', 'quotation', 'dealSheet', 'job', 'product', 'supplier',
      'purchaseRequest', 'purchaseOrder', 'grn', 'deliveryNote', 'proformaInvoice', 'customerInvoice', 'stock',
    ];
    const extra = this.entityTypes.filter((t) => !ordered.includes(t));
    this.views = [
      { id: 'all', label: 'All', count: this.query.viewId === 'all' ? this.total : undefined, hideCount: this.query.viewId !== 'all' },
      ...[...ordered, ...extra].map((type) => ({
        id: type,
        label: this.moduleLabel(type),
        count: this.query.viewId === type ? this.total : undefined,
        hideCount: this.query.viewId !== type,
      })),
    ];
  }
}
