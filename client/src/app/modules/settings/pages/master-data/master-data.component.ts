import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { Responsibility } from 'src/app/shared/interfaces/employee.interface';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { MasterListEditorComponent } from './master-list-editor.component';
import { NotesTermsSettingsComponent } from '../notes-terms-settings/notes-terms-settings.component';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { CreateCustomerTypeDialog } from 'src/app/modules/hr/pages/create-customer-type/create-customer-type.component';

const MASTER_DIALOG_SIZE = { width: '560px', maxWidth: '95vw' };

type MasterDataTab = 'customer' | 'product' | 'purchase' | 'sales' | 'notesTerms' | 'responsibility';

@Component({
  selector: 'app-master-data',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent, MasterListEditorComponent, NotesTermsSettingsComponent],
  template: `
    <div class="w-full min-h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="master-data"></app-settings-section-header>

      <div class="mt-6 border-b border-gray-200 dark:border-gray-700">
        <nav class="-mb-px flex flex-wrap gap-4" aria-label="Master data groups">
          <button *ngFor="let tab of tabs" type="button" (click)="activeTab = tab.id"
            class="border-b-2 px-1 pb-3 text-sm font-medium transition"
            [class.border-violet-600]="activeTab === tab.id"
            [class.text-violet-700]="activeTab === tab.id"
            [class.dark:text-violet-300]="activeTab === tab.id"
            [class.border-transparent]="activeTab !== tab.id"
            [class.text-gray-500]="activeTab !== tab.id"
            [class.hover:text-gray-700]="activeTab !== tab.id"
            [class.dark:text-gray-400]="activeTab !== tab.id"
            [class.dark:hover:text-gray-200]="activeTab !== tab.id">
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="mt-5 rounded-lg border border-violet-100 bg-violet-50/60 p-4 text-sm text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-200">
        <div class="font-semibold">{{ currentTab?.label }}</div>
        <p class="mt-1 text-xs leading-5 text-violet-800/80 dark:text-violet-200/80">{{ currentTab?.description }}</p>
      </div>

      <div *ngIf="activeTab === 'customer'" class="mt-8 space-y-10">
        <app-master-list-editor class="block" list="paymentTerms" title="Payment terms" valueLabel="Days" placeholder="e.g. Net 30"
          hint="Used on Customer now; also reused by Quotation and Deal approval checks."></app-master-list-editor>
        <app-master-list-editor class="block" list="source" title="Customer sources" placeholder="e.g. Referral"
          hint="Used by Customer records to classify how the customer relationship started."></app-master-list-editor>
        <app-master-list-editor class="block" list="industry" title="Industries" placeholder="e.g. Construction"
          hint="Used by Customer records to classify the business segment."></app-master-list-editor>
        <div class="grid gap-5 lg:grid-cols-2">
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-medium text-gray-900 dark:text-gray-100">Customer types</div>
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Used by Customer records for customer classification and default discount context.
                </p>
              </div>
              <button type="button" (click)="onCreateCustomerType()"
                class="shrink-0 rounded-md bg-violet-700 px-3 py-2 text-xs font-medium text-white hover:bg-violet-600">+ Add</button>
            </div>
            <p *ngIf="customerTypeLoading" class="mt-5 text-sm text-gray-500">Loading customer types...</p>
            <p *ngIf="!customerTypeLoading && !customerTypes.length" class="mt-5 text-sm text-gray-500">No customer types yet.</p>
            <div *ngIf="!customerTypeLoading && customerTypes.length" class="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
              <div *ngFor="let item of customerTypes; let i = index" class="flex items-center justify-between gap-3 py-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.customerTypeName }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ customerTypeMeta(item) }}</p>
                </div>
                <div class="shrink-0 whitespace-nowrap text-xs">
                  <button type="button" class="mr-3 text-violet-700 hover:underline" (click)="onEditCustomerType(i)">Edit</button>
                  <button type="button" class="text-red-600 hover:underline" (click)="onDeleteCustomerType(i)">Delete</button>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-medium text-gray-900 dark:text-gray-100">Customer departments</div>
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Used for customer contact departments, such as Procurement, Accounts or Engineering.
                </p>
              </div>
              <button type="button" (click)="onCreateCustomerDepartment()"
                class="shrink-0 rounded-md bg-violet-700 px-3 py-2 text-xs font-medium text-white hover:bg-violet-600">+ Add</button>
            </div>
            <p *ngIf="customerDepartmentLoading" class="mt-5 text-sm text-gray-500">Loading customer departments...</p>
            <p *ngIf="!customerDepartmentLoading && !customerDepartments.length" class="mt-5 text-sm text-gray-500">No customer departments yet.</p>
            <div *ngIf="!customerDepartmentLoading && customerDepartments.length" class="mt-5 divide-y divide-gray-100 dark:divide-gray-800">
              <div *ngFor="let item of customerDepartments; let i = index" class="flex items-center justify-between gap-3 py-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.departmentName }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ customerDepartmentMeta(item) }}</p>
                </div>
                <div class="shrink-0 whitespace-nowrap text-xs">
                  <button type="button" class="mr-3 text-violet-700 hover:underline" (click)="onEditCustomerDepartment(i)">Edit</button>
                  <button type="button" class="text-red-600 hover:underline" (click)="onDeleteCustomerDepartment(i)">Delete</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="activeTab === 'product'" class="mt-8 space-y-10">
        <app-master-list-editor class="block" list="unit" title="Units of measure" placeholder="e.g. Box"
          hint="Used by Product records and quantity-based sales documents."></app-master-list-editor>
        <app-master-list-editor class="block" list="tax" title="Tax rates" valueLabel="Rate %" placeholder="e.g. VAT 5%"
          hint="Used by Product now and intended for Quotation/Deal tax calculation."></app-master-list-editor>
        <div class="block rounded-lg border border-dashed border-gray-300 p-5 text-sm dark:border-gray-700">
          <div class="font-medium text-gray-900 dark:text-gray-100">Item categories</div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Planned master data. Add backend list support before wiring product/category selection.
          </p>
        </div>
      </div>

      <div *ngIf="activeTab === 'sales'" class="mt-8 space-y-6">
        <div class="block rounded-lg border border-gray-200 p-5 dark:border-gray-700">
          <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">Sales document lists are shared, not duplicated</div>
          <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Quotation, Deal Sheet and Job Sheet should consume the same master data instead of maintaining separate copies.
            Edit payment terms in Customer Data, and tax/unit values in Product Data.
          </p>
        </div>
        <div class="grid gap-5 md:grid-cols-3">
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment terms</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used for quotation text, deal approval payment-term days, and customer default terms.</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Tax rates</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used for product tax now; should feed quotation/deal line tax calculation.</p>
          </div>
          <div class="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Units</div>
            <p class="mt-2 text-sm text-gray-700 dark:text-gray-300">Used by products and should flow into quotation/deal/job sheet quantity lines.</p>
          </div>
        </div>
      </div>

      <div *ngIf="activeTab === 'purchase'" class="mt-8 space-y-6"> 
        <app-notes-terms-settings [embedded]="true" listScope="purchase"></app-notes-terms-settings>
      </div>

      <div *ngIf="activeTab === 'notesTerms'" class="mt-8 space-y-6">
        <app-notes-terms-settings [embedded]="true"></app-notes-terms-settings>
      </div>

      <div *ngIf="activeTab === 'responsibility'" class="mt-8 space-y-6">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Responsibilities</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          What a role can be accountable for, such as approving finance items. Tick them per role in HR, Roles &amp; Privileges.
        </p>

        <form class="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 p-5 dark:border-gray-700" (ngSubmit)="add()">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
            <input name="label" [(ngModel)]="newLabel" required maxlength="60" placeholder="e.g. Procurement buyer"
              class="w-64 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          </label>
          <label class="block grow">
            <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Description (optional)</span>
            <input name="description" [(ngModel)]="newDescription" maxlength="140"
              class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          </label>
          <button type="submit" [disabled]="!newLabel.trim() || saving"
            class="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-50">+ Add</button>
        </form>
        <p *ngIf="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="w-full text-sm">
            <thead class="bg-gray-100 dark:bg-gray-800 text-left text-[13px] font-medium text-gray-700 dark:text-gray-300">
              <tr><th class="px-4 py-3">Name</th><th class="px-4 py-3">Key</th><th class="px-4 py-3">Description</th><th class="px-4 py-3">Active</th><th class="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              <tr *ngIf="loading"><td colspan="5" class="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
              <tr *ngIf="!loading && !items.length"><td colspan="5" class="px-4 py-6 text-center text-gray-500">No responsibilities yet.</td></tr>
              <tr *ngFor="let r of items" class="border-t border-gray-100 dark:border-gray-800">
                <ng-container *ngIf="editingId !== r._id; else editRow">
                  <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ r.label }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ r.key }}</td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{{ r.description || '-' }}</td>
                  <td class="px-4 py-3">
                    <input type="checkbox" [checked]="r.isActive" (change)="toggleActive(r)" class="h-4 w-4 cursor-pointer accent-violet-600" [attr.aria-label]="'Active: ' + r.label">
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" class="mr-3 text-violet-700 hover:underline" (click)="startEdit(r)">Edit</button>
                    <button type="button" class="text-red-600 hover:underline" (click)="remove(r)">Delete</button>
                  </td>
                </ng-container>
                <ng-template #editRow>
                  <td class="px-4 py-2"><input [(ngModel)]="editLabel" maxlength="60" class="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
                  <td class="px-4 py-2 text-gray-500">{{ r.key }}</td>
                  <td class="px-4 py-2"><input [(ngModel)]="editDescription" maxlength="140" class="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
                  <td class="px-4 py-2"></td>
                  <td class="px-4 py-2 text-right whitespace-nowrap">
                    <button type="button" class="mr-3 text-violet-700 hover:underline" [disabled]="!editLabel.trim()" (click)="saveEdit(r)">Save</button>
                    <button type="button" class="text-gray-600 hover:underline" (click)="editingId = null">Cancel</button>
                  </td>
                </ng-template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class MasterDataComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  items: Responsibility[] = [];
  loading = true;
  saving = false;
  error = '';
  activeTab: MasterDataTab = 'customer';
  employeeId = '';
  customerTypes: any[] = [];
  customerDepartments: any[] = [];
  customerTypeUsage: Record<string, number> = {};
  departmentUsage: { customers: Record<string, number>, enquiries: Record<string, number>, contacts: Record<string, number>, employees: Record<string, number> } =
    { customers: {}, enquiries: {}, contacts: {}, employees: {} };
  customerTypeLoading = true;
  customerDepartmentLoading = true;
  readonly tabs: { id: MasterDataTab; label: string; description: string }[] = [
    { id: 'customer', label: 'Customer Data', description: 'Customer-facing lists and shared classifications used by Customer and downstream sales documents.' },
    { id: 'product', label: 'Product Data', description: 'Product setup lists used by product records and quantity/tax calculations.' },
    { id: 'purchase', label: 'Purchase Data', description: 'Purchase/LPO text lists: terms & conditions, place of delivery and shipping terms.' },
    { id: 'sales', label: 'Sales Documents', description: 'Shows which shared lists should feed quotation, deal sheet and job sheet workflows.' },
    { id: 'notesTerms', label: 'Notes & Terms', description: 'Default customer notes and terms & conditions printed on quotations and sales documents.' },
    { id: 'responsibility', label: 'Responsibilities', description: 'Role accountability lists used by HR roles and future approval routing.' },
  ];

  newLabel = '';
  newDescription = '';

  editingId: string | null = null;
  editLabel = '';
  editDescription = '';

  get currentTab(): { id: MasterDataTab; label: string; description: string } | undefined {
    return this.tabs.find((tab) => tab.id === this.activeTab);
  }

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe((employee) => {
      this.employeeId = employee?._id ?? this.employeeId;
    });
    this.employeeService.getResponsibilities().subscribe({
      next: (list) => { this.items = list; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.loadCustomerMasterData();
  }

  loadCustomerMasterData(): void {
    this.customerTypeLoading = true;
    this.customerDepartmentLoading = true;
    this.profileService.getCustomerTypes().subscribe({
      next: (list) => { this.customerTypes = list ?? []; this.customerTypeLoading = false; },
      error: () => { this.customerTypeLoading = false; },
    });
    this.profileService.getCustomerDepartments().subscribe({
      next: (list) => { this.customerDepartments = list ?? []; this.customerDepartmentLoading = false; },
      error: () => { this.customerDepartmentLoading = false; },
    });
    this.profileService.getCustomerTypeUsage().subscribe({
      next: (usage) => { this.customerTypeUsage = usage ?? {}; },
      error: () => {},
    });
    this.profileService.getDepartmentUsage().subscribe({
      next: (usage) => { this.departmentUsage = usage ?? this.departmentUsage; },
      error: () => {},
    });
  }

  private plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  customerTypeMeta(item: any): string {
    const parts: string[] = [];
    if (item?.isActive === false) parts.push('Inactive');
    if (item?.defaultDiscount) parts.push(`${item.defaultDiscount}% discount`);
    parts.push(this.plural(this.customerTypeUsage[item?._id] ?? 0, 'customer'));
    return parts.join(' · ');
  }

  customerDepartmentMeta(item: any): string {
    const parts: string[] = [];
    if (item?.isActive === false) parts.push('Inactive');
    if (item?.code) parts.push(`Code ${item.code}`);
    parts.push(this.plural(this.departmentUsage.contacts[item?._id] ?? 0, 'contact'));
    return parts.join(' · ');
  }

  onCreateCustomerType(): void {
    const dialogRef = this.dialog.open(CreateCustomerTypeDialog, { ...MASTER_DIALOG_SIZE, data: {} });
    dialogRef.afterClosed().subscribe((data) => {
      if (!data) return;
      this.customerTypes = [...this.customerTypes, data];
      this.loadCustomerMasterData();
    });
  }

  onEditCustomerType(index: number): void {
    const customerType = this.customerTypes[index];
    if (!customerType) return;
    const dialogRef = this.dialog.open(CreateCustomerTypeDialog, { ...MASTER_DIALOG_SIZE, data: { customerType } });
    dialogRef.afterClosed().subscribe((data) => {
      if (!data) return;
      this.customerTypes = this.customerTypes.map((item, i) => i === index ? data : item);
      this.loadCustomerMasterData();
    });
  }

  async onDeleteCustomerType(index: number): Promise<void> {
    const customerType = this.customerTypes[index];
    if (!customerType) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Customer Type?',
      message: `Delete "${customerType.customerTypeName}"?`,
      consequence: 'This cannot be undone. Customers using this type may block the delete.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.profileService.deleteCustomerType({ dataId: customerType._id, employee: this.employeeId }).subscribe({
      next: () => {
        this.customerTypes = this.customerTypes.filter((_, i) => i !== index);
        this.toast.success('Customer Type deleted successfully');
        this.loadCustomerMasterData();
      },
      error: (e) => this.toast.error(e.error?.message || 'Failed to delete customer type'),
    });
  }

  onCreateCustomerDepartment(): void {
    const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...MASTER_DIALOG_SIZE, data: { forCustomer: true } });
    dialogRef.afterClosed().subscribe((data) => {
      if (!data) return;
      this.customerDepartments = [...this.customerDepartments, data];
      this.loadCustomerMasterData();
    });
  }

  onEditCustomerDepartment(index: number): void {
    const department = this.customerDepartments[index];
    if (!department) return;
    const dialogRef = this.dialog.open(CreateDepartmentDialog, { ...MASTER_DIALOG_SIZE, data: { forCustomer: true, department } });
    dialogRef.afterClosed().subscribe((data) => {
      if (!data) return;
      this.customerDepartments = this.customerDepartments.map((item, i) => i === index ? data : item);
      this.loadCustomerMasterData();
    });
  }

  async onDeleteCustomerDepartment(index: number): Promise<void> {
    const department = this.customerDepartments[index];
    if (!department) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Customer Department?',
      message: `Delete "${department.departmentName}"?`,
      consequence: 'This cannot be undone. Customer contacts using this department may block the delete.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.profileService.deleteCustomerDepartment({ dataId: department._id, employee: this.employeeId }).subscribe({
      next: () => {
        this.customerDepartments = this.customerDepartments.filter((_, i) => i !== index);
        this.toast.success('Customer department deleted successfully');
        this.loadCustomerMasterData();
      },
      error: (e) => this.toast.error(e.error?.message || 'Failed to delete customer department'),
    });
  }

  add(): void {
    if (!this.newLabel.trim()) return;
    this.saving = true;
    this.error = '';
    this.employeeService.createResponsibility({ label: this.newLabel.trim(), description: this.newDescription.trim() }).subscribe({
      next: (created) => {
        this.items = [...this.items, created].sort((a, b) => a.label.localeCompare(b.label));
        this.newLabel = this.newDescription = '';
        this.saving = false;
      },
      error: (e) => { this.saving = false; this.error = typeof e.error === 'string' ? e.error : 'Could not add responsibility'; },
    });
  }

  startEdit(r: Responsibility): void {
    this.editingId = r._id ?? null;
    this.editLabel = r.label;
    this.editDescription = r.description ?? '';
  }

  saveEdit(r: Responsibility): void {
    this.employeeService.updateResponsibility(r._id!, { label: this.editLabel.trim(), description: this.editDescription.trim() }).subscribe({
      next: (updated) => { Object.assign(r, updated); this.editingId = null; },
      error: () => this.toast.error('Could not save changes'),
    });
  }

  toggleActive(r: Responsibility): void {
    this.employeeService.updateResponsibility(r._id!, { isActive: !r.isActive }).subscribe({
      next: (updated) => { r.isActive = updated.isActive; },
      error: () => this.toast.error('Could not update'),
    });
  }

  async remove(r: Responsibility): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete responsibility?',
      message: `Delete "${r.label}"?`,
      consequence: 'Roles still using it will block the delete; deactivate it instead to hide it from new roles.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.employeeService.deleteResponsibility(r._id!).subscribe({
      next: () => { this.items = this.items.filter((x) => x !== r); },
      error: (e) => this.toast.error(e.error?.message ?? 'Could not delete'),
    });
  }
}
