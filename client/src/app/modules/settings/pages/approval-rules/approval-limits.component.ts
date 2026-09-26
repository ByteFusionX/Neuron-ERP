import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { settingsEditAccess } from '../../settings-edit-access';
import { ApprovalLimit, GetCategory } from 'src/app/shared/interfaces/employee.interface';

interface LimitRow {
  _id: string;
  name: string;
  employeeId: string;
  roleName: string;
  maxAmount: number | null;
  maxDiscountPercent: number | null;
  saved: ApprovalLimit;
  saving: boolean;
}

@Component({
  selector: 'app-approval-limits',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <app-settings-section-header label="Limits" description="The most each person may approve." icon="heroScale"></app-settings-section-header>
    <div class="p-6">
      <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
        The most each person may approve. Leave a field empty for no limit.
        Limits are stored per employee.
      </p>
      <input type="search" [(ngModel)]="search" placeholder="Search by name or ID" aria-label="Search employees"
        class="mb-3 h-9 w-72 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-erp-surface-dark">

      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 text-left text-[13px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <tr>
              <th class="px-4 py-3">Employee</th>
              <th class="px-4 py-3">Role</th>
              <th class="px-4 py-3">Max amount</th>
              <th class="px-4 py-3">Max discount %</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngIf="loading"><td colspan="5" class="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
            <tr *ngIf="!loading && !filtered.length"><td colspan="5" class="px-4 py-6 text-center text-gray-500">No employees found.</td></tr>
            <tr *ngFor="let r of filtered" class="border-t border-gray-100 dark:border-gray-800">
              <td class="px-4 py-2">
                <p class="font-medium text-gray-900 dark:text-gray-100">{{ r.name }}</p>
                <p class="text-xs text-gray-500">{{ r.employeeId }}</p>
              </td>
              <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ r.roleName }}</td>
              <td class="px-4 py-2">
                <input type="number" min="0" [(ngModel)]="r.maxAmount" placeholder="No limit" [attr.aria-label]="'Max amount for ' + r.name"
                  class="h-9 w-32 rounded-lg border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-erp-surface-dark">
              </td>
              <td class="px-4 py-2">
                <input type="number" min="0" max="100" [(ngModel)]="r.maxDiscountPercent" placeholder="No limit" [attr.aria-label]="'Max discount for ' + r.name"
                  class="h-9 w-32 rounded-lg border border-gray-200 bg-white px-2 dark:border-white/10 dark:bg-erp-surface-dark">
              </td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button type="button" *ngIf="canEdit()" (click)="save(r)" [disabled]="!dirty(r) || r.saving"
                  class="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40">
                  {{ r.saving ? 'Saving...' : 'Save' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ApprovalLimitsComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);
  readonly canEdit = settingsEditAccess('approvalRulesEdit');

  rows: LimitRow[] = [];
  loading = true;
  search = '';

  get filtered(): LimitRow[] {
    const q = this.search.trim().toLowerCase();
    return q ? this.rows.filter((r) => `${r.name} ${r.employeeId}`.toLowerCase().includes(q)) : this.rows;
  }

  ngOnInit(): void {
    forkJoin({
      employees: this.employeeService.getEmployeeApprovalLimits(),
      categories: this.employeeService.getCategory(),
    }).subscribe({
      next: ({ employees, categories }) => {
        const byId = new Map<string, GetCategory>(categories.filter((c) => c._id).map((c) => [c._id!, c]));
        this.rows = (employees ?? []).map((e) => {
          const role = byId.get(e.category);
          const saved: ApprovalLimit = {
            maxAmount: e.approvalLimit?.maxAmount ?? null,
            maxDiscountPercent: e.approvalLimit?.maxDiscountPercent ?? null,
          };
          return {
            _id: e._id,
            name: `${e.firstName} ${e.lastName}`,
            employeeId: e.employeeId,
            roleName: role?.categoryName ?? '-',
            maxAmount: saved.maxAmount,
            maxDiscountPercent: saved.maxDiscountPercent,
            saved,
            saving: false,
          };
        });
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  dirty(r: LimitRow): boolean {
    return this.norm(r.maxAmount) !== r.saved.maxAmount || this.norm(r.maxDiscountPercent) !== r.saved.maxDiscountPercent;
  }

  save(r: LimitRow): void {
    const limit: ApprovalLimit = { maxAmount: this.norm(r.maxAmount), maxDiscountPercent: this.norm(r.maxDiscountPercent) };
    r.saving = true;
    this.employeeService.setEmployeeApprovalLimit(r._id, limit).subscribe({
      next: (res) => {
        r.saved = { maxAmount: res?.maxAmount ?? null, maxDiscountPercent: res?.maxDiscountPercent ?? null };
        r.maxAmount = r.saved.maxAmount;
        r.maxDiscountPercent = r.saved.maxDiscountPercent;
        r.saving = false;
      },
      error: (e) => {
        r.saving = false;
        this.toast.error(e?.error?.message ?? 'Could not save limit');
      },
    });
  }

  /** Cleared number inputs come back as null or ''; treat both as "no limit". */
  private norm(v: number | string | null): number | null {
    return v === null || v === '' ? null : Number(v);
  }
}
