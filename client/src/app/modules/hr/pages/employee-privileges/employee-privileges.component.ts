import { Component, OnInit, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { filter, forkJoin, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

interface PrivilegeFlag { path: string; label: string; }
interface PrivilegeModule { key: string; label: string; flags: PrivilegeFlag[]; abbr?: string; description?: string; }

// Badge letters and one-line descriptions, kept identical to the role drawer.
const MODULE_META: Record<string, [string, string]> = {
  employee: ['EM', 'Staff records'],
  announcement: ['AN', 'Company-wide notices'],
  customer: ['CU', 'Customer accounts'],
  enquiry: ['EN', 'Incoming sales enquiries'],
  assignedJob: ['PS', 'Presale jobs'],
  quotation: ['QT', 'Customer quotations'],
  dealSheet: ['DS', 'Deal sheet approvals'],
  jobSheet: ['JS', 'Jobs and allocation'],
  purchase: ['PR', 'Purchase requisitions'],
  purchaseOrder: ['PO', 'LPOs and purchase orders'],
  grn: ['GR', 'Goods received notes'],
  dispatch: ['DN', 'Delivery notes'],
  invoice: ['IN', 'Customer invoices'],
  technical: ['TE', 'Pending projects and AMC'],
  supplier: ['SU', 'Supplier accounts'],
  claims: ['CL', 'Expense claims'],
  sensitiveData: ['SD', 'Cost, margin and discount'],
};

// Mirrors the boolean action flags from role-form-drawer.component.ts. Only flags that
// requirePrivilege actually gates on an `action` (or a bare-boolean module) can be granted
// here — viewReport data-scope strings aren't something an individual grant makes sense for.
const PRIVILEGE_MODULES: PrivilegeModule[] = [
  { key: 'employee', label: 'Employees', flags: [
    { path: 'employee.create', label: 'Create employees' },
    { path: 'employee.edit', label: 'Edit employees' },
    { path: 'employee.delete', label: 'Delete employees' },
    { path: 'employee.block', label: 'Block / unblock employees' },
    { path: 'employee.viewCompensation', label: 'View compensation' },
  ]},
  { key: 'announcement', label: 'Announcements', flags: [
    { path: 'announcement.create', label: 'Create announcements' },
    { path: 'announcement.deleteOrEdit', label: 'Edit or delete announcements' },
  ]},
  { key: 'customer', label: 'Customers', flags: [
    { path: 'customer.create', label: 'Create customers' },
    { path: 'customer.edit', label: 'Edit customers' },
    { path: 'customer.delete', label: 'Delete customers' },
    { path: 'customer.share', label: 'Share with other employees' },
    { path: 'customer.transfer', label: 'Transfer to other employees' },
  ]},
  { key: 'enquiry', label: 'Enquiries', flags: [
    { path: 'enquiry.create', label: 'Create enquiries' },
  ]},
  { key: 'assignedJob', label: 'Presales', flags: [
    { path: 'assignedJob.assign', label: 'Assign presale jobs' },
  ]},
  { key: 'quotation', label: 'Quotations', flags: [
    { path: 'quotation.create', label: 'Create quotations' },
  ]},
  { key: 'dealSheet', label: 'Deal Sheet', flags: [
    { path: 'dealSheet', label: 'Approve deal sheets' },
  ]},
  { key: 'jobSheet', label: 'Job Sheet', flags: [
    { path: 'jobSheet.allocateJobs', label: 'Allocate jobs' },
    { path: 'jobSheet.transferProcurementPerson', label: 'Transfer procurement person' },
  ]},
  { key: 'purchase', label: 'Purchase', flags: [
    { path: 'purchase.create', label: 'Create purchases' },
    { path: 'purchase.canApprovePR', label: 'Approve purchase requisitions' },
    { path: 'purchase.canAssign', label: 'Assign purchase' },
  ]},
  { key: 'purchaseOrder', label: 'Purchase Orders', flags: [
    { path: 'purchaseOrder.canInitiateLPO', label: 'Initiate LPO and issue PO' },
    { path: 'purchaseOrder.canApprovePOs', label: 'Approve purchase orders' },
    { path: 'purchaseOrder.canReissueAndRevoke', label: 'Re-issue and revoke POs' },
  ]},
  { key: 'grn', label: 'GRN', flags: [
    { path: 'grn.canUploadInvoice', label: 'Upload supplier invoice' },
  ]},
  { key: 'dispatch', label: 'Dispatch', flags: [
    { path: 'dispatch.createDeliveryNote', label: 'Create delivery note' },
    { path: 'dispatch.viewPendingDelivery', label: 'View pending delivery' },
    { path: 'dispatch.viewInvoiceLinking', label: 'View invoice linking' },
    { path: 'dispatch.viewInventoryDeduction', label: 'View inventory deduction' },
  ]},
  { key: 'invoice', label: 'Invoice', flags: [
    { path: 'invoice.createInvoice', label: 'Create invoice' },
    { path: 'invoice.viewInvoicesVsDn', label: 'View invoices vs DN' },
    { path: 'invoice.viewCancelledAdjusted', label: 'View cancelled / adjusted' },
    { path: 'invoice.viewReissued', label: 'View reissued' },
  ]},
  { key: 'technical', label: 'Technical', flags: [
    { path: 'technical.canViewOpenToWorkAndAssign', label: 'View open-to-work and assign engineer' },
    { path: 'technical.canTransferToEngineer', label: 'Transfer to another engineer' },
    { path: 'technical.canApproveMRRequests', label: 'Approve MR requests' },
  ]},
  { key: 'supplier', label: 'Suppliers', flags: [
    { path: 'supplier.canApproveSupplier', label: 'Approve suppliers' },
  ]},
  { key: 'claims', label: 'Claims', flags: [
    { path: 'claims.canApprove', label: 'Approve claims' },
  ]},
  { key: 'sensitiveData', label: 'Sensitive Data', flags: [
    { path: 'sensitiveData.viewCost', label: 'View cost' },
    { path: 'sensitiveData.viewMargin', label: 'View margin' },
    { path: 'sensitiveData.overrideDiscount', label: 'Override discount' },
  ]},
].map((m) => ({ ...m, abbr: MODULE_META[m.key]?.[0], description: MODULE_META[m.key]?.[1] }));

interface EmployeeRow {
  _id: string;
  name: string;
  employeeId: string;
  roleName: string;
  granted: Set<string>;
  extraCount: number;
  expiresAt: string | null;
}

@Component({
  selector: 'app-employee-privileges',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, FormsModule,DataGridComponent, SmartFormModule, ActionButtonComponent],
  template: `
    <div class="h-full flex flex-col bg-gray-50 dark:bg-erp-surface-dark-alt">
      <app-data-grid class="flex-1 min-h-0"
        [fillHeight]="true"
        title="User-Specific"
        subtitle="Grant extra flags to a specific person, on top of their role."
        [breadcrumbs]="breadcrumbs"
        rowKey="_id"
        storageKey="hr-user-privileges"
        exportable
        exportFileName="user-privileges.xlsx"
        [views]="views"
        [showDetailPanel]="false"
        [tallRows]="true"
        [data]="rows"
        [columns]="columns"
        [loading]="loading"
        searchPlaceholder="Search by name or ID"
        emptyMessage="No employees found"
        [createLabel]="canCreate ? 'Add User Role' : ''"
        (create)="openCreate()"
        (rowOpen)="openRow($event)">
      </app-data-grid>
    </div>

    <app-sf-drawer title="Add user role" subtitle="Give one employee extra access for a set number of days." width="960px"
      [open]="createOpen" (closed)="createOpen = false">
      <app-sf-section title="Basic information" columns="2">
        <app-sf-field label="Employee" required>
          <app-sf-combobox [(ngModel)]="createEmployeeId" name="createEmployee" [options]="employeeOptions" placeholder="Select employee"></app-sf-combobox>
        </app-sf-field>
        <app-sf-field label="Time period (days)" required hint="1 to 3650 days">
          <app-sf-number [(ngModel)]="createDays" name="createDays" [min]="1" [max]="3650" suffix="days" placeholder="e.g. 30"></app-sf-number>
        </app-sf-field>
      </app-sf-section>

      <app-sf-section title="Access privileges" description="Grants are additive only: they add access the role does not give. When the time period ends they stop applying.">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-[220px]">
              <app-sf-input type="search" clearable [(ngModel)]="search" name="createSearch" placeholder="Search modules or permissions"></app-sf-input>
            </div>
            <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              {{ createGranted.size }} flag(s) granted
            </span>
          </div>

          <div *ngIf="filteredModules.length" class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] md:grid-rows-1 md:h-[calc(100vh-420px)] md:min-h-[360px] rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-white/10 dark:bg-erp-surface-dark">
            <nav class="max-h-72 md:max-h-none min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-100 p-2 space-y-0.5 dark:border-white/10" aria-label="Modules">
              <button *ngFor="let m of filteredModules" type="button" (click)="selectedModule = m"
                class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors"
                [ngClass]="activeModule.key === m.key ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'">
                <span class="flex items-center justify-center w-7 h-7 shrink-0 rounded-md text-[10px] font-bold transition-colors"
                  [ngClass]="createGrantedIn(m) ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-gray-100 text-gray-400 dark:bg-white/5'">{{ m.abbr }}</span>
                <span class="flex-1 min-w-0 text-sm truncate"
                  [ngClass]="activeModule.key === m.key ? 'font-semibold text-violet-700 dark:text-violet-200' : (createGrantedIn(m) ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400')">{{ m.label }}</span>
                <span *ngIf="createGrantedIn(m)" class="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                  {{ createGrantedIn(m) }}/{{ m.flags.length }}
                </span>
              </button>
            </nav>

            <section class="min-h-0 overflow-y-auto">
              <header class="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-erp-surface-dark/95">
                <span class="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-xs font-bold"
                  [ngClass]="createGrantedIn(activeModule) ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-gray-100 text-gray-400 dark:bg-white/5'">{{ activeModule.abbr }}</span>
                <div class="min-w-0 flex-1">
                  <h4 class="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">{{ activeModule.label }}</h4>
                  <p class="text-xs text-gray-500 truncate dark:text-gray-400">{{ activeModule.description }}</p>
                </div>
              </header>
              <div class="px-5 py-5">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</p>
                <div class="rounded-lg border border-gray-100 divide-y divide-gray-100 dark:border-white/10 dark:divide-white/10">
                  <label *ngFor="let f of activeModule.flags" class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                    <span class="text-sm text-gray-700 dark:text-gray-200">{{ f.label }}</span>
                    <input type="checkbox" class="sr-only peer" [checked]="createGranted.has(f.path)" (change)="toggleCreateFlag(f, $any($event.target).checked)">
                    <span class="relative shrink-0 w-9 h-5 rounded-full bg-gray-200 transition-colors dark:bg-white/15 peer-checked:bg-violet-600 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/40
                      after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"></span>
                  </label>
                </div>
              </div>
            </section>
          </div>
          <p *ngIf="!filteredModules.length" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No modules match "{{ search }}".</p>
        </div>
      </app-sf-section>

      <ng-container sfDrawerFooter>
        <app-action-button variant="secondary" (click)="createOpen = false">Cancel</app-action-button>
        <app-action-button variant="primary" [disabled]="!createValid || creating" (click)="saveCreate()">{{ creating ? 'Saving...' : 'Add User Role' }}</app-action-button>
      </ng-container>
    </app-sf-drawer>

    <app-sf-drawer [title]="selected?.name ?? ''" [subtitle]="selected ? selected.employeeId + ' · ' + selected.roleName : ''" width="960px"
      [open]="drawerOpen" (closed)="drawerOpen = false">
      <div *ngIf="selected as row">
       <app-sf-section title="Extra privileges" description="Grants are additive only: they add access the role doesn't give, never remove it. Changes save immediately.">
        <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex-1 min-w-[220px]">
            <app-sf-input type="search" clearable [(ngModel)]="search" name="editSearch" placeholder="Search modules or permissions"></app-sf-input>
          </div>
          <span class="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            {{ row.granted.size }} flag(s) granted
          </span>
        </div>

        <div *ngIf="filteredModules.length" class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-white/10 dark:bg-erp-surface-dark">
          <nav class="max-h-72 md:max-h-[560px] overflow-y-auto border-b md:border-b-0 md:border-r border-gray-100 p-2 space-y-0.5 dark:border-white/10" aria-label="Modules">
            <button *ngFor="let m of filteredModules" type="button" (click)="selectedModule = m"
              [attr.aria-current]="activeModule.key === m.key ? 'true' : null"
              class="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors"
              [ngClass]="activeModule.key === m.key ? 'bg-violet-50 dark:bg-violet-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'">
              <span class="flex items-center justify-center w-7 h-7 shrink-0 rounded-md text-[10px] font-bold transition-colors"
                [ngClass]="grantedIn(row, m) ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-gray-100 text-gray-400 dark:bg-white/5'">{{ m.abbr }}</span>
              <span class="flex-1 min-w-0 text-sm truncate"
                [ngClass]="activeModule.key === m.key ? 'font-semibold text-violet-700 dark:text-violet-200' : (grantedIn(row, m) ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400')">{{ m.label }}</span>
              <span *ngIf="grantedIn(row, m)" class="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {{ grantedIn(row, m) }}/{{ m.flags.length }}
              </span>
            </button>
          </nav>

          <section class="max-h-[560px] overflow-y-auto">
            <header class="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-erp-surface-dark/95">
              <span class="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-xs font-bold"
                [ngClass]="grantedIn(row, activeModule) ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-gray-100 text-gray-400 dark:bg-white/5'">{{ activeModule.abbr }}</span>
              <div class="min-w-0 flex-1">
                <h4 class="text-sm font-semibold text-gray-900 truncate dark:text-gray-100">{{ activeModule.label }}</h4>
                <p class="text-xs text-gray-500 truncate dark:text-gray-400">{{ activeModule.description }}</p>
              </div>
            </header>
            <div class="px-5 py-5">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</p>
              <div class="rounded-lg border border-gray-100 divide-y divide-gray-100 dark:border-white/10 dark:divide-white/10">
                <label *ngFor="let f of activeModule.flags" class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 has-[:disabled]:cursor-not-allowed">
                  <span class="text-sm text-gray-700 dark:text-gray-200">{{ f.label }}</span>
                  <input type="checkbox" class="sr-only peer" [checked]="row.granted.has(f.path)" [disabled]="!canEdit || saving.has(f.path)"
                    (change)="toggle(row, f, $any($event.target).checked)">
                  <span class="relative shrink-0 w-9 h-5 rounded-full bg-gray-200 transition-colors dark:bg-white/15 peer-checked:bg-violet-600 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/40
                    after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"></span>
                </label>
              </div>
            </div>
          </section>
        </div>
        <p *ngIf="!filteredModules.length" class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No modules match "{{ search }}".</p>
        </div>
       </app-sf-section>
      </div>

      <ng-container sfDrawerFooter>
        <app-action-button variant="secondary" (click)="drawerOpen = false">Close</app-action-button>
      </ng-container>
    </app-sf-drawer>
  `,
})
export class EmployeePrivilegesComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);

  readonly PRIVILEGE_MODULES = PRIVILEGE_MODULES;

  /** Every employee (for the Add picker); `rows` is only those with individual grants. */
  allRows: EmployeeRow[] = [];
  rows: EmployeeRow[] = [];
  loading = true;
  drawerOpen = false;
  selected: EmployeeRow | null = null;
  selectedModule: PrivilegeModule | null = null;
  canEdit = false;
  canCreate = false;
  saving = new Set<string>();

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Administration' }, { label: 'HR' }, { label: 'Roles & Privileges' }, { label: 'User Specific' }];
  views: DataGridView<EmployeeRow>[] = [];
  columns: DataGridColumn<EmployeeRow>[] = [
    { key: 'name', label: 'Employee', sortable: true, locked: true },
    { key: 'employeeId', label: 'Employee ID', sortable: true },
    { key: 'roleName', label: 'Role', sortable: true },
    { key: 'extraCount', label: 'Extra Flags Granted', type: 'number', sortable: true },
    { key: 'expiresAt', label: 'Access Expires', sortable: true, valueGetter: (r) => this.expiryLabel(r) },
  ];

  createOpen = false;
  creating = false;
  createEmployeeId = '';
  createDays: number | null = null;

  createGranted = new Set<string>();

  get employeeOptions(): SfOption[] {
    return this.allRows.map((r) => ({ label: `${r.name} (${r.employeeId}) · ${r.roleName}`, value: r._id }));
  }

  get createValid(): boolean {
    return !!this.createEmployeeId && Number.isInteger(this.createDays) && this.createDays! >= 1 && this.createDays! <= 3650
      && this.createGranted.size > 0;
  }

  createGrantedIn(m: PrivilegeModule): number {
    return m.flags.filter((f) => this.createGranted.has(f.path)).length;
  }

  toggleCreateFlag(flag: PrivilegeFlag, checked: boolean): void {
    if (checked) this.createGranted.add(flag.path);
    else this.createGranted.delete(flag.path);
  }

  openCreate(): void {
    this.createEmployeeId = '';
    this.createDays = null;
    this.createGranted = new Set();
    this.selectedModule = null;
    this.search = '';
    this.createOpen = true;
  }

  saveCreate(): void {
    if (!this.createValid) return;
    this.creating = true;
    const id = this.createEmployeeId;
    const flags = [...this.createGranted];
    forkJoin([
      this.employeeService.setEmployeeExtraPrivilegeExpiry(id, this.createDays),
      ...flags.map((path) => {
        const [modulePath, action] = this.splitPath(path);
        return this.employeeService.setEmployeeExtraPrivilege(id, modulePath, true, action);
      }),
    ]).subscribe({
      next: ([expiry]) => {
        this.creating = false;
        const row = this.allRows.find((r) => r._id === id);
        if (row) {
          flags.forEach((f) => row.granted.add(f));
          row.extraCount = row.granted.size;
          row.expiresAt = (expiry as { expiresAt: string | null }).expiresAt;
          this.applyRows();
        }
        this.createOpen = false;
        this.toast.success('User role added');
      },
      error: (e) => {
        this.creating = false;
        this.toast.error(e?.error?.message ?? 'Could not add user role');
      },
    });
  }

  private applyRows(): void {
    this.rows = this.allRows.filter((r) => r.extraCount > 0);
  }

  private expiryLabel(r: EmployeeRow): string {
    if (!r.expiresAt) return r.extraCount ? 'No expiry' : '-';
    const d = new Date(r.expiresAt);
    const text = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    return d.getTime() <= Date.now() ? `Expired ${text}` : text;
  }

  search = '';

  get filteredModules(): PrivilegeModule[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return PRIVILEGE_MODULES;
    return PRIVILEGE_MODULES.filter((m) =>
      m.label.toLowerCase().includes(q) || m.flags.some((f) => f.label.toLowerCase().includes(q)));
  }

  get activeModule(): PrivilegeModule {
    const list = this.filteredModules;
    return list.find((m) => m.key === this.selectedModule?.key) ?? list[0] ?? PRIVILEGE_MODULES[0];
  }

  openRow(row: EmployeeRow): void {
    this.selected = row;
    this.selectedModule = null;
    this.search = '';
    this.drawerOpen = true;
  }

  grantedIn(row: EmployeeRow, m: PrivilegeModule): number {
    return m.flags.filter((f) => row.granted.has(f.path)).length;
  }

  ngOnInit(): void {
    this.employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((e) => {
      this.canEdit = !!e?.category?.privileges?.roles?.edit;
      this.canCreate = !!e?.category?.privileges?.roles?.create || this.canEdit;
    });

    forkJoin({
      employees: this.employeeService.getEmployeeExtraPrivileges(),
      categories: this.employeeService.getCategory(),
    }).subscribe({
      next: ({ employees, categories }) => {
        const byId = new Map<string, GetCategory>(categories.filter((c) => c._id).map((c) => [c._id!, c]));
        this.allRows = (employees ?? []).map((e) => {
          const granted = this.flatten(e.extraPrivileges);
          const role = byId.get(e.category);
          return {
            _id: e._id,
            name: `${e.firstName} ${e.lastName}`,
            employeeId: e.employeeId,
            roleName: role?.categoryName ?? '-',
            granted: new Set(granted),
            extraCount: granted.length,
            expiresAt: e.extraPrivilegesExpiresAt ?? null,
          };
        });
        this.applyRows();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  toggle(row: EmployeeRow, flag: PrivilegeFlag, checked: boolean): void {
    const [modulePath, action] = this.splitPath(flag.path);
    this.saving.add(flag.path);
    this.employeeService.setEmployeeExtraPrivilege(row._id, modulePath, checked, action).subscribe({
      next: () => {
        this.saving.delete(flag.path);
        if (checked) row.granted.add(flag.path);
        else row.granted.delete(flag.path);
        row.extraCount = row.granted.size;
        this.applyRows();
      },
      error: (e) => {
        this.saving.delete(flag.path);
        this.toast.error(e?.error?.message ?? 'Could not save privilege');
      },
    });
  }

  /** "purchase.canApprovePR" -> ["purchase", "canApprovePR"]; "dealSheet" (no sub-action) -> ["dealSheet", undefined]. */
  private splitPath(path: string): [string, string | undefined] {
    const i = path.lastIndexOf('.');
    return i === -1 ? [path, undefined] : [path.slice(0, i), path.slice(i + 1)];
  }

  /** Flattens a sparse extraPrivileges object into the same dotted-path strings used in PRIVILEGE_MODULES. */
  private flatten(obj: Record<string, any> | undefined, prefix = ''): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') return this.flatten(v, path);
      return v === true ? [path] : [];
    });
  }
}
