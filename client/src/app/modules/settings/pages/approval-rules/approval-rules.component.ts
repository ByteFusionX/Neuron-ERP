import { Component, OnInit } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { HrApprovalLimitsComponent } from 'src/app/modules/hr/pages/hr-approval-limits/hr-approval-limits.component';
import { EmployeeApprovalLimitsComponent } from './employee-approval-limits.component';
import { ApprovalRule,ApprovalRuleService, ApprovalRuleType } from 'src/app/core/services/approval-rule.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';

interface RuleRow {
  type: ApprovalRuleType;
  label: string;
  description: string;
  unit: string;
  enabled: boolean;
  threshold: number | null;
  approverRole: string | null;
  saving: boolean;
  error: string;
}

const RULE_DEFS: { type: ApprovalRuleType; label: string; description: string; unit: string }[] = [
  { type: 'discount', label: 'Discount', description: 'Quotation discount above this needs approval.', unit: '% discount' },
  { type: 'margin', label: 'Margin', description: 'Margin below this needs approval.', unit: '% margin' },
  { type: 'paymentTerms', label: 'Payment terms', description: 'Terms longer than this need approval.', unit: 'days' },
  { type: 'creditException', label: 'Credit exception', description: 'Exceeding a customer credit limit by more than this needs approval.', unit: 'amount' },
  { type: 'deal', label: 'Deal approval', description: 'Deals above this value need approval.', unit: 'amount' },
];

@Component({
  selector: 'app-approval-rules',
  standalone: true,
  imports: [NgFor, NgIf, AsyncPipe, FormsModule, HrApprovalLimitsComponent, EmployeeApprovalLimitsComponent],
  template: `
    <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
      <button type="button" *ngFor="let t of tabs" (click)="active = t.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        [class.border-blue-600]="active === t.id" [class.text-blue-600]="active === t.id"
        [class.border-transparent]="active !== t.id" [class.text-gray-600]="active !== t.id">
        {{ t.label }}
      </button>
    </div>

    <div *ngIf="active === 'rules'" class="p-6 space-y-3">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Define when approval is needed and who approves. Rules are saved here; they are not yet enforced in quotations or deals.
      </p>
      <div *ngFor="let r of rules" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-erp-surface-dark">
        <div class="flex flex-wrap items-center gap-4">
          <div class="min-w-[220px] flex-1">
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ r.label }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ r.description }}</p>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" [(ngModel)]="r.enabled"> Enabled
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input type="number" min="0" [(ngModel)]="r.threshold" placeholder="Threshold"
              class="w-28 h-9 px-2 rounded-lg border border-gray-200 bg-white dark:bg-erp-surface-dark dark:border-white/10">
            <span class="text-xs text-gray-500">{{ r.unit }}</span>
          </label>
          <select [(ngModel)]="r.approverRole"
            class="h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm dark:bg-erp-surface-dark dark:border-white/10">
            <option [ngValue]="null">Approver role…</option>
            <option *ngFor="let c of (categories$ | async)" [ngValue]="c._id">{{ c.categoryName }}</option>
          </select>
          <button type="button" (click)="save(r)" [disabled]="r.saving"
            class="px-4 py-2 text-sm font-medium text-white rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50">
            {{ r.saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <p *ngIf="r.error" class="mt-2 text-xs text-red-600">{{ r.error }}</p>
      </div>
    </div>

    <app-hr-approval-limits *ngIf="active === 'limits'"></app-hr-approval-limits>
    <app-employee-approval-limits *ngIf="active === 'employee-limits'"></app-employee-approval-limits>
  `,
})
export class ApprovalRulesComponent implements OnInit {
  tabs = [
    { id: 'rules', label: 'Rules' },
    { id: 'limits', label: 'Limits' },
    { id: 'employee-limits', label: 'Employee limits' },
  ];
  active = 'rules';
  rules: RuleRow[] = RULE_DEFS.map(d => ({ ...d, enabled: false, threshold: null, approverRole: null, saving: false, error: '' }));
  categories$!: Observable<GetCategory[]>;

  constructor(private _rules: ApprovalRuleService, private _employeeService: EmployeeService) {}

  ngOnInit(): void {
    this.categories$ = this._employeeService.getCategory();
    this._rules.getRules().subscribe(res => {
      (res?.data || []).forEach((saved: ApprovalRule) => {
        const row = this.rules.find(r => r.type === saved.type);
        if (!row) return;
        row.enabled = saved.enabled;
        row.threshold = saved.threshold;
        row.approverRole = typeof saved.approverRole === 'object' && saved.approverRole ? saved.approverRole._id : (saved.approverRole as string | null);
      });
    });
  }

  save(r: RuleRow): void {
    r.saving = true;
    r.error = '';
    this._rules.saveRule(r.type, { enabled: r.enabled, threshold: r.threshold, approverRole: r.approverRole }).subscribe({
      next: () => (r.saving = false),
      error: (e) => {
        r.saving = false;
        r.error = e?.error?.message || 'Failed to save rule';
      },
    });
  }
}
