import { Component, OnInit, ViewChild } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApprovalRule, ApprovalRuleService, ApprovalRuleType } from 'src/app/core/services/approval-rule.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { settingsEditAccess } from '../../settings-edit-access';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DataGridBreadcrumb, DataGridCellEditEvent, DataGridColumn, DataGridDetailTab, DataGridRowAction, DataGridRowActionEvent } from 'src/app/shared/components/data-grid/data-grid.model';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailOverviewSection } from 'src/app/shared/components/detail-panel/detail-panel.model';

interface RulePlace {
  id: string;
  module: string;
  where: string;
}

interface RuleRow {
  _id: string;
  type: ApprovalRuleType;
  label: string;
  description: string;
  unit: string;
  places: RulePlace[];
  disabledPlaces: string[];
  savedDisabledPlaces: string[];
  enabled: boolean;
  threshold: number | null;
  approverRole: string | null;
  savedEnabled: boolean;
  savedThreshold: number | null;
  savedApproverRole: string | null;
  saving: boolean;
  error: string;
}

const RULE_DEFS: { type: ApprovalRuleType; label: string; description: string; unit: string; places: RulePlace[] }[] = [
  {
    type: 'discount',
    label: 'Discount',
    description: 'Quotation discount above this needs approval.',
    unit: '% discount',
    places: [
      { id: 'quotation-form', module: 'Quotation', where: 'Creation & edit' },
      { id: 'quotation-approval', module: 'Quotation', where: 'Approval flow' },
    ],
  },
  {
    type: 'margin',
    label: 'Margin',
    description: 'Margin below this needs approval.',
    unit: '% margin',
    places: [{ id: 'quotation-form', module: 'Quotation', where: 'Creation & edit' }],
  },
  {
    type: 'creditException',
    label: 'Credit exception',
    description: 'Exceeding a customer credit limit by more than this needs approval.',
    unit: 'amount',
    places: [{ id: 'customer-credit-check', module: 'Customer', where: 'Credit limit checks' }],
  },
  {
    type: 'deal',
    label: 'Deal Value',
    description: 'Deals above this value need approval.',
    unit: 'amount',
    places: [{ id: 'deal-sheet-approval', module: 'Deal Sheet', where: 'Approval flow' }],
  },
  {
    type: 'poValue',
    label: 'PO value',
    description: 'Purchase orders above this value need approval.',
    unit: 'amount',
    places: [],
  },
  {
    type: 'priceVariance',
    label: 'Price variance',
    description: 'PO price above the last or quoted price by more than this needs approval.',
    unit: '% over last/quoted price',
    places: [],
  },
  {
    type: 'purchaseOverSold',
    label: 'Purchase over sold price',
    description: 'Buying above the sold price by more than this needs approval.',
    unit: '% over sold price',
    places: [],
  },
  {
    type: 'overReceipt',
    label: 'Over-receipt tolerance',
    description: 'Receiving more than ordered by more than this needs approval.',
    unit: '% over ordered qty',
    places: [],
  },
  {
    type: 'grnPriceVariance',
    label: 'GRN price variance',
    description: 'GRN price differing from the PO price by more than this needs approval (three-way match).',
    unit: '% price variance',
    places: [],
  },
];

@Component({
  selector: 'app-approval-rules',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, FormsModule, SettingsSectionHeaderComponent, DataGridComponent, ActionButtonComponent, DetailOverviewComponent],
  templateUrl: './approval-rules.component.html',
  styleUrl: './approval-rules.component.css',
})
export class ApprovalRulesComponent implements OnInit {
  @ViewChild('rulesGrid') rulesGrid?: DataGridComponent<RuleRow>;

  rules: RuleRow[] = RULE_DEFS.map((d) => ({
    ...d,
    _id: d.type,
    enabled: false,
    threshold: null,
    approverRole: null,
    savedEnabled: false,
    savedThreshold: null,
    savedApproverRole: null,
    disabledPlaces: [],
    savedDisabledPlaces: [],
    saving: false,
    error: '',
  }));
  categories: GetCategory[] = [];
  categories$!: Observable<GetCategory[]>;
  isLoading = true;

  readonly canEdit = settingsEditAccess('approvalRulesEdit');

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Home', link: '/' }, { label: 'Settings' }];

  columns: DataGridColumn<RuleRow>[] = [
    { key: 'label', label: 'Rule', sortable: true, locked: true, valueGetter: (row) => row.label },
    {
      key: 'threshold',
      label: 'Threshold',
      type: 'number',
      align: 'left',
      width: '130px',
      sortable: true,
      editable: true,
      editor: 'number',
      valueGetter: (row) => row.threshold,
    },
    {
      key: 'approverRole',
      label: 'Approver',
      width: '180px',
      editable: true,
      editor: 'select',
      editorOptions: [],
      valueGetter: (row) => this.roleName(row.approverRole),
    },
    {
      key: 'status',
      label: 'Status',
      type: 'badge',
      width: '130px',
      sortable: true,
      badgeClasses: {
        Enabled: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30',
        Disabled: 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      },
      valueGetter: (row) => (row.enabled ? 'Enabled' : 'Disabled'),
    },
  ];

  rowActions: DataGridRowAction<RuleRow>[] = [
    { id: 'open', label: 'View details', icon: 'visibility', quick: true },
  ];

  onRowAction(event: DataGridRowActionEvent<RuleRow>): void {
    if (event.action.id === 'open') this.rulesGrid?.openRow(event.row);
  }

  detailTabs: DataGridDetailTab[] = [{ id: 'overview', label: 'Overview', icon: 'info' }];

  constructor(private _rules: ApprovalRuleService, private _employeeService: EmployeeService) {}

  ngOnInit(): void {
    this.categories$ = this._employeeService.getCategory();
    this.categories$.subscribe((c) => {
      this.categories = c ?? [];
      const col = this.columns.find((c) => c.key === 'approverRole');
      if (col) col.editorOptions = [{ label: 'Approver role…', value: null }, ...this.categories.map((cat) => ({ label: cat.categoryName, value: cat._id }))];
    });
    this._rules.getRules().subscribe((res) => {
      (res?.data || []).forEach((saved: ApprovalRule) => {
        const row = this.rules.find((r) => r.type === saved.type);
        if (!row) return;
        this.applySaved(row, saved);
      });
      this.isLoading = false;
    });
  }

  private applySaved(row: RuleRow, saved: ApprovalRule): void {
    row.enabled = saved.enabled;
    row.threshold = saved.threshold;
    row.approverRole = typeof saved.approverRole === 'object' && saved.approverRole ? saved.approverRole._id : (saved.approverRole as string | null);
    row.savedEnabled = row.enabled;
    row.savedThreshold = row.threshold;
    row.savedApproverRole = row.approverRole;
    row.disabledPlaces = [...(saved.disabledPlaces ?? [])];
    row.savedDisabledPlaces = [...row.disabledPlaces];
  }

  roleName(id: string | null): string {
    if (!id) return '—';
    return this.categories.find((c) => c._id === id)?.categoryName ?? '—';
  }

  detailTitle(row: RuleRow): string {
    return row.label;
  }

  detailSubtitle(row: RuleRow): string {
    return row.enabled ? 'Enabled' : 'Disabled';
  }

  overviewSections(row: RuleRow): DetailOverviewSection[] {
    return [
      {
        title: 'Rule details', columns: '2', fields: [
          { type: 'dg', key: 'status', label: 'Status' },
          { type: 'field', label: 'Type', value: row.label },
          { type: 'dg', key: 'threshold', label: 'Threshold (' + row.unit + ')' },
          { type: 'dg', key: 'approverRole', label: 'Approver' },
          { type: 'field', label: 'Description', value: row.description, noHover: true, stacked: true },
        ],
      },
    ];
  }

  placeEnabled(row: RuleRow, place: RulePlace): boolean {
    return row.enabled && !row.disabledPlaces.includes(place.id);
  }

  togglePlace(row: RuleRow, place: RulePlace): void {
    if (!this.canEdit() || !row.enabled) return;
    row.disabledPlaces = row.disabledPlaces.includes(place.id)
      ? row.disabledPlaces.filter((p) => p !== place.id)
      : [...row.disabledPlaces, place.id];
    this.save(row);
  }

  onCellEdit(event: DataGridCellEditEvent<RuleRow>): void {
    const row = event.row;
    if (!this.canEdit()) return;
    if (event.column.key === 'threshold') row.threshold = event.newValue;
    if (event.column.key === 'approverRole') row.approverRole = event.newValue;
    this.save(row);
  }

  toggleEnabled(row: RuleRow): void {
    if (!this.canEdit()) return;
    row.enabled = !row.enabled;
    this.save(row);
  }

  private save(row: RuleRow): void {
    row.saving = true;
    row.error = '';
    this._rules
      .saveRule(row.type, { enabled: row.enabled, threshold: row.threshold, approverRole: row.approverRole, disabledPlaces: row.disabledPlaces })
      .subscribe({
        next: (res) => {
          row.saving = false;
          if (res?.data) this.applySaved(row, res.data);
        },
        error: (e) => {
          row.saving = false;
          row.error = e?.error?.message || 'Failed to save rule';
          row.enabled = row.savedEnabled;
          row.threshold = row.savedThreshold;
          row.approverRole = row.savedApproverRole;
          row.disabledPlaces = [...row.savedDisabledPlaces];
        },
      });
  }
}
