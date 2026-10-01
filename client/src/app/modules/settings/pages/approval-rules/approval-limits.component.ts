import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridCellEditEvent, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { settingsEditAccess } from '../../settings-edit-access';
import { ApprovalLimit, GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { ModalService } from 'src/app/shared/components/modal/modal.service';
import { AddApprovalLimitData, AddApprovalLimitModalComponent, AddApprovalLimitResult } from './add-approval-limit-modal.component';

type LimitEmployee = { _id: string; employeeId: string; firstName: string; lastName: string; category: string; approvalLimit?: ApprovalLimit };

interface LimitRow {
  _id: string;
  name: string;
  employeeId: string;
  roleName: string;
  maxAmount: number | null;
  maxDiscountPercent: number | null;
  saved: ApprovalLimit;
  saving: boolean;
  error: string;
}

@Component({
  selector: 'app-approval-limits',
  standalone: true,
  imports: [NgIf, DataGridComponent, DetailOverviewComponent],
  styles: [`
    .qt-meta { padding: 0.625rem 0.75rem; min-width: 0; }
    .qt-meta + .qt-meta { border-left: 1px solid #e5e7eb; }
    .qt-meta-label { font-size: 0.6875rem; color: #6b7280; }
    .qt-meta-value { margin-top: 0.125rem; font-size: 0.8125rem; font-weight: 500; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    :host-context(html.dark) .qt-meta + .qt-meta { border-left-color: #262626; }
    :host-context(html.dark) .qt-meta-label { color: #a1a1a1; }
    :host-context(html.dark) .qt-meta-value { color: #ededed; }
  `],
  template: `
    <div class="h-full">
      <app-data-grid
        #limitsGrid
        class="flex-1 min-h-0"
        [fillHeight]="true"
        [tallRows]="true"
        [data]="rows"
        [columns]="columns"
        [rowActions]="rowActions"
        [breadcrumbs]="breadcrumbs"
        [loading]="loading"
        [selectable]="false"
        [showToolbarTools]="false"
        title="Limits"
        subtitle="Employees with a personal approval limit. Leave a field empty for no limit."
        rowKey="_id"
        storageKey="approval-limits"
        emptyMessage="No limits set yet"
        [createLabel]="canEdit() ? 'Add employee' : ''"
        (create)="openAdd()"
        searchPlaceholder="Search by name or ID…"
        [detailTabs]="detailTabs"
        [detailTitle]="detailTitle"
        [detailSubtitle]="detailSubtitle"
        detailBreadcrumb="Limits"
        (cellEdit)="onCellEdit($event)"
        (rowAction)="onRowAction($event)">

        <ng-template #detailMetaTemplate let-row>
          <div class="qt-meta"><p class="qt-meta-label">Role</p><p class="qt-meta-value">{{ row.roleName }}</p></div>
          <div class="qt-meta"><p class="qt-meta-label">Max amount</p><p class="qt-meta-value">{{ row.maxAmount ?? 'No limit' }}</p></div>
          <div class="qt-meta"><p class="qt-meta-label">Max discount %</p><p class="qt-meta-value">{{ row.maxDiscountPercent ?? 'No limit' }}</p></div>
        </ng-template>

        <ng-template #detailTemplate let-row let-tab="tab">
          <ng-container *ngIf="tab === 'overview'">
            <app-detail-overview [grid]="limitsGrid" [row]="row" [sections]="overviewSections(row)"></app-detail-overview>
            <p *ngIf="row.error" class="mt-3 text-xs text-red-600">{{ row.error }}</p>
          </ng-container>
        </ng-template>
      </app-data-grid>
    </div>
  `,
})
export class ApprovalLimitsComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);
  private modal = inject(ModalService);
  readonly canEdit = settingsEditAccess('approvalRulesEdit');

  @ViewChild('limitsGrid') limitsGrid?: DataGridComponent<LimitRow>;

  rows: LimitRow[] = [];

  rowActions: DataGridRowAction<LimitRow>[] = [
    { id: 'open', label: 'View details', icon: 'visibility', quick: true },
  ];

  onRowAction(event: DataGridRowActionEvent<LimitRow>): void {
    if (event.action.id === 'open') this.limitsGrid?.openRow(event.row);
  }
  /** Every active employee, so the add modal can offer those without a limit. */
  private allEmployees: LimitEmployee[] = [];
  private roles = new Map<string, GetCategory>();
  loading = true;

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Settings' }];

  columns: DataGridColumn<LimitRow>[] = [
    { key: 'name', label: 'Employee', sortable: true, locked: true, valueGetter: (r) => r.name },
    { key: 'employeeId', label: 'ID', width: '120px', sortable: true, valueGetter: (r) => r.employeeId },
    { key: 'roleName', label: 'Role', width: '180px', sortable: true, valueGetter: (r) => r.roleName },
    { key: 'maxAmount', label: 'Max amount', type: 'number', align: 'left', width: '150px', sortable: true, editable: true, editor: 'number', valueGetter: (r) => r.maxAmount },
    { key: 'maxDiscountPercent', label: 'Max discount %', type: 'number', align: 'left', width: '160px', sortable: true, editable: true, editor: 'number', valueGetter: (r) => r.maxDiscountPercent },
  ];

  detailTabs: DataGridDetailTab[] = [{ id: 'overview', label: 'Overview', icon: 'info' }];

  detailTitle(r: LimitRow): string { return r.name; }
  detailSubtitle(r: LimitRow): string { return r.employeeId; }

  overviewSections(r: LimitRow): DetailOverviewSection[] {
    return [
      {
        title: 'Approval limits', columns: '2', fields: [
          { type: 'field', label: 'Employee', value: r.name },
          { type: 'field', label: 'Role', value: r.roleName },
          { type: 'dg', key: 'maxAmount', label: 'Max amount' },
          { type: 'dg', key: 'maxDiscountPercent', label: 'Max discount %' },
        ],
      },
    ];
  }

  onCellEdit(event: DataGridCellEditEvent<LimitRow>): void {
    if (!this.canEdit()) return;
    const r = event.row;
    if (event.column.key === 'maxAmount') r.maxAmount = this.norm(event.newValue);
    else if (event.column.key === 'maxDiscountPercent') r.maxDiscountPercent = this.norm(event.newValue);
    else return;
    if (this.dirty(r)) this.save(r);
  }

  ngOnInit(): void {
    forkJoin({
      employees: this.employeeService.getEmployeeApprovalLimits(),
      categories: this.employeeService.getCategory(),
    }).subscribe({
      next: ({ employees, categories }) => {
        this.roles = new Map<string, GetCategory>(categories.filter((c) => c._id).map((c) => [c._id!, c]));
        this.allEmployees = employees ?? [];
        this.rows = this.allEmployees.filter((e) => this.hasLimit(e.approvalLimit)).map((e) => this.toRow(e));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  openAdd(): void {
    if (!this.canEdit()) return;
    const listed = new Set(this.rows.map((r) => r._id));
    const data: AddApprovalLimitData = {
      employees: this.allEmployees
        .filter((e) => !listed.has(e._id))
        .map((e) => ({ _id: e._id, label: `${e.firstName} ${e.lastName} (${e.employeeId})`, role: this.roles.get(e.category)?.categoryName ?? '-' })),
    };
    this.modal.open<AddApprovalLimitResult, AddApprovalLimitData>(AddApprovalLimitModalComponent, { width: '520px', data }).afterClosed().subscribe((res) => {
      if (!res) return;
      const emp = this.allEmployees.find((e) => e._id === res.employeeId);
      if (!emp) return;
      const limit: ApprovalLimit = { maxAmount: res.maxAmount, maxDiscountPercent: res.maxDiscountPercent };
      this.employeeService.setEmployeeApprovalLimit(emp._id, limit).subscribe({
        next: (saved) => {
          emp.approvalLimit = { maxAmount: saved?.maxAmount ?? null, maxDiscountPercent: saved?.maxDiscountPercent ?? null };
          this.rows = [...this.rows, this.toRow(emp)];
          this.toast.success('Limit added');
        },
        error: (e) => this.toast.error(e?.error?.message ?? 'Could not save limit'),
      });
    });
  }

  private hasLimit(l?: ApprovalLimit): boolean {
    return l?.maxAmount != null || l?.maxDiscountPercent != null;
  }

  private toRow(e: LimitEmployee): LimitRow {
    const saved: ApprovalLimit = { maxAmount: e.approvalLimit?.maxAmount ?? null, maxDiscountPercent: e.approvalLimit?.maxDiscountPercent ?? null };
    return {
      _id: e._id,
      name: `${e.firstName} ${e.lastName}`,
      employeeId: e.employeeId,
      roleName: this.roles.get(e.category)?.categoryName ?? '-',
      maxAmount: saved.maxAmount,
      maxDiscountPercent: saved.maxDiscountPercent,
      saved,
      saving: false,
      error: '',
    };
  }

  dirty(r: LimitRow): boolean {
    return this.norm(r.maxAmount) !== r.saved.maxAmount || this.norm(r.maxDiscountPercent) !== r.saved.maxDiscountPercent;
  }

  save(r: LimitRow): void {
    const limit: ApprovalLimit = { maxAmount: this.norm(r.maxAmount), maxDiscountPercent: this.norm(r.maxDiscountPercent) };
    r.saving = true;
    r.error = '';
    this.employeeService.setEmployeeApprovalLimit(r._id, limit).subscribe({
      next: (res) => {
        r.saved = { maxAmount: res?.maxAmount ?? null, maxDiscountPercent: res?.maxDiscountPercent ?? null };
        r.maxAmount = r.saved.maxAmount;
        r.maxDiscountPercent = r.saved.maxDiscountPercent;
        r.saving = false;
      },
      error: (e) => {
        r.saving = false;
        r.error = e?.error?.message ?? 'Could not save limit';
        r.maxAmount = r.saved.maxAmount;
        r.maxDiscountPercent = r.saved.maxDiscountPercent;
        this.toast.error(e?.error?.message ?? 'Could not save limit');
      },
    });
  }

  /** Cleared number inputs come back as null or ''; treat both as "no limit". */
  private norm(v: number | string | null | undefined): number | null {
    return v === null || v === undefined || v === '' ? null : Number(v);
  }
}
