import { Component, OnInit } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApprovalRule,ApprovalRuleService, ApprovalRuleType } from 'src/app/core/services/approval-rule.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { settingsEditAccess } from '../../settings-edit-access';
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
  imports: [NgFor, NgIf, AsyncPipe, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <app-settings-section-header label="Rules" description="Thresholds that route a deal to an approver." icon="heroAdjustmentsHorizontal"></app-settings-section-header>
    <div class="p-6 space-y-3">
      <div class="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
        <p class="font-semibold">Deal approval rules are active controls.</p>
        <p class="mt-1 text-blue-800/80 dark:text-blue-200/80">
          Enabled rules are checked when a pending deal is approved. If a deal breaches a rule, only the configured approver role can approve it.
        </p>
      </div>
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
          <button type="button" *ngIf="canEdit()" (click)="save(r)" [disabled]="r.saving"
            class="px-4 py-2 text-sm font-medium text-white rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50">
            {{ r.saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <p *ngIf="r.error" class="mt-2 text-xs text-red-600">{{ r.error }}</p>
      </div>
    </div>
  `,
})
export class ApprovalRulesComponent implements OnInit {
  rules: RuleRow[] = RULE_DEFS.map(d => ({ ...d, enabled: false, threshold: null, approverRole: null, saving: false, error: '' }));
  categories$!: Observable<GetCategory[]>;
  readonly canEdit = settingsEditAccess('approvalRulesEdit');

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
