import { Component, OnInit } from '@angular/core';
import { NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { take, switchMap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { FormatStringPipe } from 'src/app/shared/pipes/formatString.pipe';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailOverviewComponent } from 'src/app/shared/components/detail-panel/detail-overview.component';
import { DetailTableComponent } from 'src/app/shared/components/detail-panel/detail-table.component';
import { DetailTimelineComponent } from 'src/app/shared/components/detail-panel/detail-timeline.component';
import { DetailOverviewSection, DetailTableColumn, DetailTimelineEntry } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { AuditLogService } from 'src/app/core/services/audit-log.service';
import { toTimelineEntries } from 'src/app/shared/utils/audit-timeline.util';
import {
  DetailViewBadge,
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
  DetailViewTab,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

const STATUS_TONE: Record<string, DetailViewBadge['tone']> = {
  Active: 'good',
  Prospect: 'info',
  'On Hold': 'warn',
  Blacklisted: 'bad',
  Inactive: 'neutral',
};

@Component({
  selector: 'app-customer-view',
  standalone: true,
  imports: [NgIf, NgSwitch, NgSwitchCase, DetailViewShellComponent, DetailOverviewComponent, DetailTableComponent, DetailTimelineComponent, ActionButtonComponent],
  template: `
    <div class="flex h-full flex-col p-6 bg-gray-50 dark:bg-erp-surface-dark-alt">
      <app-detail-view-shell
        class="min-h-0 flex-1"
        [loading]="loading"
        [empty]="!customer"
        emptyTitle="Customer not found"
        emptyMessage="This customer does not exist or you do not have access to it."
        [emptyLink]="['/customers']"
        emptyLinkLabel="Back to customers"
        [breadcrumbs]="breadcrumbs"
        [avatarText]="avatarText"
        [title]="customer?.companyName || ''"
        [subtitle]="customer?.clientRef || ''"
        [badges]="badges"
        [stats]="stats"
        [tabs]="tabs"
        [activeTab]="tab"
        (activeTabChange)="tab = $any($event)"
        [hasSidebar]="false"
      >
        <ng-container footerRight>
          <app-action-button variant="secondary" (click)="back()">Close</app-action-button>
        </ng-container>
        <div tabBody [ngSwitch]="tab">
          <div *ngSwitchCase="'overview'">
            <app-detail-overview *ngIf="customer" [grid]="noGrid" [row]="customer" [sections]="sections"></app-detail-overview>
          </div>
          <div *ngSwitchCase="'contacts'">
            <app-detail-table title="Contacts" [columns]="contactColumns" [rows]="contactRows" emptyMessage="No contacts."></app-detail-table>
          </div>
          <div *ngSwitchCase="'history'">
            <app-detail-timeline [entries]="historyEntries" emptyMessage="No history yet."></app-detail-timeline>
          </div>
        </div>
      </app-detail-view-shell>
    </div>
  `,
})
export class CustomerViewComponent implements OnInit {
  customer: getCustomer | null = null;
  loading = true;
  readonly noGrid: any = null;
  tab: 'overview' | 'contacts' | 'history' = 'overview';
  readonly tabs: DetailViewTab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'history', label: 'History' },
  ];
  historyEntries: DetailTimelineEntry[] = [];
  readonly contactColumns: DetailTableColumn[] = [
    { key: 'name', label: 'Name', type: 'text', wrap: true },
    { key: 'designation', label: 'Designation', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phoneNo', label: 'Phone', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
  ];
  breadcrumbs: DetailViewBreadcrumb[] = [];
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  sections: DetailOverviewSection[] = [];
  contactRows: Record<string, any>[] = [];
  private formatString = new FormatStringPipe();

  constructor(
    private route: ActivatedRoute,
    private customerService: CustomerService,
    private employeeService: EmployeeService,
    private toast: ToastrService,
    private auditLog: AuditLogService,
  ) {}

  get avatarText(): string {
    return (this.customer?.companyName || '').slice(0, 2).toUpperCase();
  }

  ngOnInit(): void {
    const ref = this.route.snapshot.paramMap.get('ref');
    if (!ref) {
      this.loading = false;
      return;
    }
    this.employeeService.employeeData$
      .pipe(
        take(1),
        switchMap((e) => this.customerService.getCustomerByClientRef(ref, e?.category?.privileges?.customer?.viewReport, e?._id)),
      )
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (!res?.access) {
            this.toast.warning('This customer detail cannot be displayed to you due to the permissions assigned');
            return;
          }
          this.customer = res.customerData;
          this.build(res.customerData);
          this.auditLog.getHistory('customer', res.customerData._id).subscribe({
            next: (entries) => (this.historyEntries = toTimelineEntries(entries)),
            error: () => (this.historyEntries = []),
          });
        },
        error: () => (this.loading = false),
      });
  }

  back(): void {
    if (window.history.length > 1) history.back();
    else location.href = '/customers';
  }

  private ownerName(c: getCustomer): string {
    const owner = c.createdBy as any;
    return owner ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() : '';
  }

  private build(c: getCustomer): void {
    this.breadcrumbs = [{ label: 'Customers', link: ['/customers'] }, { label: c.clientRef }];
    this.badges = c.status ? [{ label: c.status, tone: STATUS_TONE[c.status] ?? 'neutral' }] : [];
    // Same key facts as the list panel's meta strip.
    this.stats = [
      { label: 'Client Ref.', value: c.clientRef },
      { label: 'Customer Type', value: this.formatString.transform(c.customerType?.customerTypeName) || '—' },
      { label: 'Payment Terms', value: c.paymentTerms || '—' },
      { label: 'Credit Status', value: c.creditStatus || '—' },
    ];
    const date = c.createdDate ? new Date(c.createdDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const f = (label: string, value: any, numeric = false) => ({ type: 'field' as const, label, value, numeric, noHover: true });
    this.sections = [
      {
        title: 'General',
        columns: '2',
        fields: [
          f('Client Ref Id', c.clientRef, true),
          f('Customer Type', this.formatString.transform(c.customerType?.customerTypeName)),
          f('Company Name', c.companyName),
          f('Department', c.department?.departmentName),
          f('Created by / Owner', this.ownerName(c)),
          f('Created Date', date),
          f('Status', c.status),
          ...(c.statusReason ? [f('Status Reason', c.statusReason)] : []),
        ],
      },
      {
        title: 'Contact',
        columns: '2',
        fields: [
          f('Email', c.customerEmailId),
          f('Contact No.', c.contactNo),
          f('Billing Address', c.companyAddress),
          f('Shipping Address', c.sameAsBilling ? 'Same as billing' : c.shippingAddress || '—'),
          f('TRN / VAT Number', c.trn || '—'),
        ],
      },
      {
        title: 'Commercial Terms',
        columns: '2',
        fields: [
          f('Payment Terms', c.paymentTerms || '—'),
          f('Credit Limit', c.creditLimit != null ? String(c.creditLimit) : '—'),
          f('Credit Status', c.creditStatus || '—'),
          f('Currency', c.currency || '—'),
          f('Source', c.source || '—'),
          f('Tax', c.taxExempt ? 'Tax exempt' : 'VAT applies'),
        ],
      },
    ];
    this.contactRows = (c.contactDetails ?? []).map((x) => ({
      name: `${x.courtesyTitle ? x.courtesyTitle + '. ' : ''}${x.firstName} ${x.lastName}`.trim() + (x.isPrimary ? ' (Primary)' : ''),
      designation: x.designation || '—',
      email: x.email,
      phoneNo: x.phoneNo,
      department: x.department?.departmentName ?? '',
    }));
  }
}
