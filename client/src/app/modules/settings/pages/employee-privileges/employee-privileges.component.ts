import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';

interface PrivilegeFlag { path: string; label: string; }
interface PrivilegeModule { key: string; label: string; flags: PrivilegeFlag[]; }

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
  { key: 'assignedJob', label: 'Assigned Jobs', flags: [
    { path: 'assignedJob.assign', label: 'Assign presale jobs to employees' },
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
];

interface EmployeeRow {
  _id: string;
  name: string;
  employeeId: string;
  roleName: string;
  granted: Set<string>;
}

@Component({
  selector: 'app-employee-privileges',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <app-settings-section-header label="Individual Privileges" description="Grant one extra flag to a specific person, on top of their role." icon="heroKey"></app-settings-section-header>
    <div class="p-6">
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        These grants are additive only — they can give someone access their role doesn't already have,
        but can never take away something the role allows. To revoke access from everyone in a role, edit the role instead.
      </p>

      <div class="mb-4 flex flex-wrap gap-3">
        <input type="search" [(ngModel)]="search" placeholder="Search by name or ID" aria-label="Search employees"
          class="h-9 w-72 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
        <select [(ngModel)]="selectedEmployeeId" aria-label="Select employee"
          class="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-erp-surface-dark">
          <option [ngValue]="null">Select an employee…</option>
          <option *ngFor="let r of filtered" [ngValue]="r._id">{{ r.name }} ({{ r.employeeId }})</option>
        </select>
      </div>

      <p *ngIf="loading" class="text-sm text-gray-500">Loading...</p>
      <p *ngIf="!loading && !filtered.length" class="text-sm text-gray-500">No employees found.</p>

      <div *ngIf="!loading && selected as row" class="rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">{{ row.name }}</p>
            <p class="text-xs text-gray-500">{{ row.employeeId }} · {{ row.roleName }}</p>
          </div>
          <p class="text-xs text-gray-500">{{ row.granted.size }} flag(s) granted</p>
        </div>
        <div class="max-h-[28rem] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          <div *ngFor="let m of PRIVILEGE_MODULES" class="px-4 py-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ m.label }}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <label *ngFor="let f of m.flags" class="flex items-center gap-2 text-sm">
                <input type="checkbox" [checked]="row.granted.has(f.path)" [disabled]="saving.has(f.path)"
                  (change)="toggle(row, f, $any($event.target).checked)">
                {{ f.label }}
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EmployeePrivilegesComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);

  readonly PRIVILEGE_MODULES = PRIVILEGE_MODULES;

  rows: EmployeeRow[] = [];
  loading = true;
  search = '';
  selectedEmployeeId: string | null = null;
  saving = new Set<string>();

  get filtered(): EmployeeRow[] {
    const q = this.search.trim().toLowerCase();
    return q ? this.rows.filter((r) => `${r.name} ${r.employeeId}`.toLowerCase().includes(q)) : this.rows;
  }

  get selected(): EmployeeRow | undefined {
    return this.rows.find((r) => r._id === this.selectedEmployeeId);
  }

  ngOnInit(): void {
    forkJoin({
      employees: this.employeeService.getEmployeeExtraPrivileges(),
      categories: this.employeeService.getCategory(),
    }).subscribe({
      next: ({ employees, categories }) => {
        const byId = new Map<string, GetCategory>(categories.filter((c) => c._id).map((c) => [c._id!, c]));
        this.rows = (employees ?? []).map((e) => {
          const role = byId.get(e.category);
          return {
            _id: e._id,
            name: `${e.firstName} ${e.lastName}`,
            employeeId: e.employeeId,
            roleName: role?.categoryName ?? '-',
            granted: new Set(this.flatten(e.extraPrivileges)),
          };
        });
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
