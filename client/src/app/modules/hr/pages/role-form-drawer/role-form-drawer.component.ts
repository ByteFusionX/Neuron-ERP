import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';

type CheckKey = 'dashboardChecked' | 'employeeChecked' | 'announcementChecked' | 'customerChecked' | 'enquiryChecked' | 'assignedJobsChecked'
  | 'quotationChecked' | 'jobSheetChecked' | 'purchaseChecked' | 'purchaseOrderChecked' | 'grnChecked' | 'technicalChecked' | 'supplierChecked'
  | 'inventoryChecked' | 'dispatchChecked' | 'invoiceChecked' | 'claimsChecked' | 'portalChecked';

interface PrivilegeChoice { value: string; label: string; }
/** A single-choice setting, e.g. how much data the role can see. Paths are relative to `privileges`. */
interface PrivilegeScope { path: string; label: string; options: PrivilegeChoice[]; hint?: string; }
interface PrivilegeFlag { path: string; label: string; }
interface PrivilegeModule {
  key: string;
  label: string;
  abbr: string;
  description: string;
  /** Module on/off switch. Modules without one are always available. */
  master?: CheckKey;
  /** Form group passed to `onCheckboxChange` when the master switch flips. */
  group?: string;
  alwaysOn?: boolean;
  scopes: PrivilegeScope[];
  flags: PrivilegeFlag[];
}

const SCOPE: PrivilegeChoice[] = [
  { value: 'all', label: 'All records' },
  { value: 'created', label: 'Created by user' },
  { value: 'reported', label: 'Reports to user' },
  { value: 'createdAndReported', label: 'Created + reports' },
];
const scope = (path: string, label = 'Data visibility'): PrivilegeScope => ({ path, label, options: SCOPE });

/**
 * Create and edit a role (category) in a slide-over.
 * The host binds `open`, `mode` and (for edit) `category`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-role-form-drawer',
  standalone: true,
  templateUrl: './role-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class RoleFormDrawerComponent implements OnChanges {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' | 'view' = 'create';
  @Input() category: GetCategory | null = null;
  /** Fires with the saved role once the server accepted the create or edit. */
  @Output() saved = new EventEmitter<GetCategory>();
  @Output() closed = new EventEmitter<void>();

  /** Read-only until the user clicks Edit in the footer. */
  viewing = false;
  isSaving = false;
  error = '';

  responsibilityOptions: SfOption[] = [];
  readonly roleOptions: SfOption[] = [
    { label: 'Super Admin', value: 'superAdmin' },
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
  ];

  dashboardChecked = false;
  employeeChecked = false;
  announcementChecked = false;
  customerChecked = false;
  enquiryChecked = false;
  assignedJobsChecked = false;
  quotationChecked = false;
  jobSheetChecked = false;
  purchaseChecked = false;
  purchaseOrderChecked = false;
  grnChecked = false;
  technicalChecked = false;
  supplierChecked = false;
  inventoryChecked = false;
  dispatchChecked = false;
  invoiceChecked = false;
  claimsChecked = false;
  portalChecked = false;

  privilegeSearch = '';
  selectedKey: string | null = null;

  readonly privilegeModules: PrivilegeModule[] = [
    {
      key: 'dashboard', label: 'Dashboard', abbr: 'DB', description: 'Revenue and gross profit comparison', alwaysOn: true, flags: [],
      scopes: [{
        path: 'dashboard.compareAgainst', label: 'Compare against',
        hint: 'Turn on "Salesperson with assigned target" to change this.',
        options: [{ value: 'company', label: 'Company targets' }, { value: 'personal', label: 'Personal targets' }, { value: 'both', label: 'Both' }],
      }],
    },
    {
      key: 'employee', label: 'Employees', abbr: 'EM', description: 'Staff records', master: 'employeeChecked', group: 'employee',
      scopes: [scope('employee.viewReport')], flags: [{ path: 'employee.create', label: 'Create employees' }],
    },
    {
      key: 'announcement', label: 'Announcements', abbr: 'AN', description: 'Company-wide notices', master: 'announcementChecked', group: 'announcement',
      scopes: [], flags: [{ path: 'announcement.create', label: 'Create announcements' }, { path: 'announcement.deleteOrEdit', label: 'Edit or delete announcements' }],
    },
    {
      key: 'customer', label: 'Customers', abbr: 'CU', description: 'Customer accounts', master: 'customerChecked', group: 'customer',
      scopes: [scope('customer.viewReport')],
      flags: [
        { path: 'customer.create', label: 'Create customers' },
        { path: 'customer.share', label: 'Share with other employees' },
        { path: 'customer.transfer', label: 'Transfer to other employees' },
      ],
    },
    {
      key: 'enquiry', label: 'Enquiries', abbr: 'EN', description: 'Incoming sales enquiries', master: 'enquiryChecked', group: 'enquiry',
      scopes: [scope('enquiry.viewReport')], flags: [{ path: 'enquiry.create', label: 'Create enquiries' }],
    },
    {
      key: 'assignedJob', label: 'Assigned Jobs', abbr: 'AJ', description: 'Presale jobs', master: 'assignedJobsChecked', group: 'assignedJob',
      scopes: [{
        path: 'assignedJob.viewReport', label: 'Data visibility',
        options: [{ value: 'all', label: 'All presale jobs' }, { value: 'assigned', label: 'Assigned to user' }],
      }],
      flags: [],
    },
    {
      key: 'quotation', label: 'Quotations', abbr: 'QT', description: 'Customer quotations', master: 'quotationChecked', group: 'quotation',
      scopes: [scope('quotation.viewReport')],
      flags: [{ path: 'quotation.create', label: 'Create quotations' }, { path: 'quotation.canApprove', label: 'Approve quotations' }],
    },
    {
      key: 'dealSheet', label: 'Deal Sheet', abbr: 'DS', description: 'Deal sheet approvals',
      scopes: [], flags: [{ path: 'dealSheet', label: 'Approve deal sheets' }],
    },
    {
      key: 'jobSheet', label: 'Job Sheet', abbr: 'JS', description: 'Jobs and allocation', master: 'jobSheetChecked', group: 'jobSheet',
      scopes: [scope('jobSheet.viewReport')],
      flags: [{ path: 'jobSheet.allocateJobs', label: 'Allocate jobs' }, { path: 'jobSheet.transferProcurementPerson', label: 'Transfer procurement person' }],
    },
    {
      key: 'purchase', label: 'Purchase', abbr: 'PR', description: 'Purchase requisitions', master: 'purchaseChecked', group: 'purchase',
      scopes: [scope('purchase.viewReport')],
      flags: [{ path: 'purchase.create', label: 'Create purchases' }, { path: 'purchase.canApprovePR', label: 'Approve purchase requisitions' }],
    },
    {
      key: 'purchaseOrder', label: 'Purchase Orders', abbr: 'PO', description: 'LPOs and purchase orders', master: 'purchaseOrderChecked', group: 'purchaseOrder',
      scopes: [scope('purchaseOrder.viewReport')],
      flags: [
        { path: 'purchaseOrder.canInitiateLPO', label: 'Initiate LPO and issue PO' },
        { path: 'purchaseOrder.canApprovePOs', label: 'Approve purchase orders' },
        { path: 'purchaseOrder.canReissueAndRevoke', label: 'Re-issue and revoke POs' },
      ],
    },
    {
      key: 'grn', label: 'GRN', abbr: 'GR', description: 'Goods received notes', master: 'grnChecked', group: 'grn',
      scopes: [], flags: [{ path: 'grn.canUploadInvoice', label: 'Upload supplier invoice' }],
    },
    {
      key: 'dispatch', label: 'Dispatch', abbr: 'DN', description: 'Delivery notes', master: 'dispatchChecked', group: 'dispatch',
      scopes: [scope('dispatch.viewReport')],
      flags: [
        { path: 'dispatch.createDeliveryNote', label: 'Create delivery note' },
        { path: 'dispatch.viewPendingDelivery', label: 'View pending delivery' },
        { path: 'dispatch.viewInvoiceLinking', label: 'View invoice linking' },
        { path: 'dispatch.viewInventoryDeduction', label: 'View inventory deduction' },
      ],
    },
    {
      key: 'invoice', label: 'Invoice', abbr: 'IN', description: 'Customer invoices', master: 'invoiceChecked', group: 'invoice',
      scopes: [scope('invoice.viewReport')],
      flags: [
        { path: 'invoice.createInvoice', label: 'Create invoice' },
        { path: 'invoice.viewInvoicesVsDn', label: 'View invoices vs DN' },
        { path: 'invoice.viewCancelledAdjusted', label: 'View cancelled / adjusted' },
        { path: 'invoice.viewReissued', label: 'View reissued' },
      ],
    },
    {
      key: 'technical', label: 'Technical', abbr: 'TE', description: 'Pending projects and AMC', master: 'technicalChecked', group: 'technical',
      scopes: [scope('technical.viewReport', 'Pending projects / AMC visibility')],
      flags: [
        { path: 'technical.canViewOpenToWorkAndAssign', label: 'View open-to-work and assign engineer' },
        { path: 'technical.canTransferToEngineer', label: 'Transfer to another engineer' },
        { path: 'technical.canApproveMRRequests', label: 'Approve MR requests' },
      ],
    },
    {
      key: 'supplier', label: 'Suppliers', abbr: 'SU', description: 'Supplier accounts', master: 'supplierChecked', group: 'supplier',
      scopes: [scope('supplier.viewReport')], flags: [{ path: 'supplier.canApproveSupplier', label: 'Approve suppliers' }],
    },
    {
      key: 'inventory', label: 'Inventory', abbr: 'IV', description: 'Products and stock entries', master: 'inventoryChecked', group: 'inventory',
      scopes: [scope('inventory.products.viewReport', 'Products visibility'), scope('inventory.stockEntries.viewReport', 'Stock entries visibility')],
      flags: [],
    },
    {
      key: 'claims', label: 'Claims', abbr: 'CL', description: 'Expense claims', master: 'claimsChecked', group: 'claims',
      scopes: [scope('claims.viewReport')], flags: [{ path: 'claims.canApprove', label: 'Approve claims' }],
    },
    {
      key: 'sensitiveData', label: 'Sensitive Data', abbr: 'SD', description: 'Cost, margin and discount',
      scopes: [],
      flags: [
        { path: 'sensitiveData.viewCost', label: 'View cost' },
        { path: 'sensitiveData.viewMargin', label: 'View margin' },
        { path: 'sensitiveData.overrideDiscount', label: 'Override discount' },
      ],
    },
    {
      key: 'portal', label: 'Settings', abbr: 'ST', description: 'Master data management', master: 'portalChecked', group: 'portal',
      scopes: [],
      flags: [
        { path: 'portalManagement.department', label: 'Departments (create / edit / delete)' },
        { path: 'portalManagement.notesAndTerms', label: 'Customer notes and T&C (create / edit / delete)' },
        { path: 'portalManagement.companyTarget', label: 'Company target (create / edit)' },
        { path: 'portalManagement.customerType', label: 'Customer type (create / edit)' },
      ],
    },
  ];

  private _fb = inject(FormBuilder);
  private _employeeService = inject(EmployeeService);
  private _toast = inject(ToastrService);
  private optionsLoaded = false;
  private salespersonWatched = false;

  categoryForm = this._fb.group({
    categoryName: ['', Validators.required],
    role: ['', Validators.required],
    isSalespersonWithTarget: [false],
    responsibilities: new FormControl<string[]>([], { nonNullable: true }),
    approvalLimit: this._fb.group({
      maxAmount: [null as number | null],
      maxDiscountPercent: [null as number | null],
    }),
    privileges: this._fb.group({
      dashboard: this._fb.group({
        viewReport: 'all',
        compareAgainst: 'company',
      }),
      employee: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      announcement: this._fb.group({
        viewReport: 'none',
        create: [false],
        deleteOrEdit: [false]
      }),
      customer: this._fb.group({
        viewReport: 'none',
        create: [false],
        share: [false],
        transfer: [false],
      }),
      enquiry: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      assignedJob: this._fb.group({
        viewReport: 'none'
      }),
      quotation: this._fb.group({
        viewReport: 'none',
        create: [false],
        canApprove: [false],
      }),
      dealSheet: [false],
      jobSheet: this._fb.group({
        viewReport: 'none',
        allocateJobs: [false],
        transferProcurementPerson: [false],
      }),
      purchase: this._fb.group({
        viewReport: 'none',
        create: [false],
        canApprovePR: [false],
      }),
      purchaseOrder: this._fb.group({
        viewReport: 'none',
        canInitiateLPO: [false],
        canApprovePOs: [false],
        canReissueAndRevoke: [false],
      }),
      grn: this._fb.group({
        viewReport: 'none',
        canUploadInvoice: [false],
      }),
      technical: this._fb.group({
        canViewOpenToWorkAndAssign: [false],
        canTransferToEngineer: [false],
        viewReport: 'none',
        canApproveMRRequests: [false],
      }),
      supplier: this._fb.group({
        viewReport: 'none',
        canApproveSupplier: [false],
      }),
      inventory: this._fb.group({
        products: this._fb.group({
          viewReport: 'none',
        }),
        stockEntries: this._fb.group({
          viewReport: 'none',
        }),
      }),
      dispatch: this._fb.group({
        viewReport: 'none',
        createDeliveryNote: [false],
        viewPendingDelivery: [false],
        viewInvoiceLinking: [false],
        viewInventoryDeduction: [false],
      }),
      invoice: this._fb.group({
        viewReport: 'none',
        createInvoice: [false],
        viewInvoicesVsDn: [false],
        viewCancelledAdjusted: [false],
        viewReissued: [false],
      }),
      claims: this._fb.group({
        viewReport: 'none',
        canApprove: [false],
      }),
      sensitiveData: this._fb.group({
        viewCost: [false],
        viewMargin: [false],
        overrideDiscount: [false],
      }),
      portalManagement: this._fb.group({
        department: [false],
        notesAndTerms: [false],
        companyTarget: [false],
        customerType: [false]
      })
    })
  })

  private readonly defaults = this.categoryForm.getRawValue();

  get isEdit(): boolean { return this.mode !== 'create'; }

  get title(): string { return this.viewing ? 'Role Details' : this.isEdit ? 'Edit Role' : 'Create Role'; }

  get subtitle(): string {
    return this.isEdit && this.category ? this.category.categoryName : 'Access, responsibilities and approval limits';
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.categoryForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['category'])) return;
    this.loadResponsibilities();
    this.watchSalesperson();
    this.reset();
    this.viewing = this.mode === 'view';
    if (this.isEdit && this.category) this.seed(this.category);
    if (this.viewing) this.categoryForm.disable({ emitEvent: false });
  }

  private loadResponsibilities(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this._employeeService.getResponsibilities().subscribe({
      next: (list) => {
        this.responsibilityOptions = list
          .filter((r) => r.isActive)
          .map((r) => ({ label: r.label, value: r.key, description: r.description }));
      },
      error: () => { this.optionsLoaded = false; },
    });
  }

  private get dashboardGroup(): FormGroup {
    return this.categoryForm.get('privileges.dashboard') as FormGroup;
  }

  private watchSalesperson(): void {
    if (this.salespersonWatched) return;
    this.salespersonWatched = true;
    this.categoryForm.get('isSalespersonWithTarget')?.valueChanges.subscribe((isSalesperson) => {
      const compare = this.dashboardGroup.get('compareAgainst');
      if (isSalesperson) {
        compare?.enable();
      } else {
        compare?.setValue('company');
        compare?.disable();
      }
    });
  }

  private reset(): void {
    this.error = '';
    this.privilegeSearch = '';
    this.selectedKey = null;
    this.isSaving = false;
    this.categoryForm.enable({ emitEvent: false });
    this.categoryForm.reset(this.defaults);
    this.dashboardGroup.get('compareAgainst')?.disable();
    this.applyChecks(null);
    this.categoryForm.markAsPristine();
  }

  private seed(category: GetCategory): void {
    this.applyChecks(category.privileges);
    this.categoryForm.patchValue({
      categoryName: category.categoryName,
      role: category.role,
      isSalespersonWithTarget: category.isSalespersonWithTarget,
      responsibilities: this.responsibilityKeys(category),
      approvalLimit: {
        maxAmount: category.approvalLimit?.maxAmount ?? null,
        maxDiscountPercent: category.approvalLimit?.maxDiscountPercent ?? null,
      },
      privileges: category.privileges as any,
    });
    const compare = this.dashboardGroup.get('compareAgainst');
    if (category.isSalespersonWithTarget) compare?.enable();
    else compare?.disable();
    this.categoryForm.markAsPristine();
  }

  /** Roles saved before the master list held an object of booleans; read those as their keys. */
  private responsibilityKeys(category: GetCategory): string[] {
    const r = category.responsibilities;
    if (Array.isArray(r)) return r;
    return r ? Object.keys(r).filter((k) => r[k]) : [];
  }

  private applyChecks(privileges: Privileges | null): void {
    if (!privileges) {
      this.dashboardChecked = this.employeeChecked = this.announcementChecked = this.customerChecked = this.enquiryChecked =
        this.assignedJobsChecked = this.quotationChecked = this.jobSheetChecked = this.purchaseChecked = this.purchaseOrderChecked =
        this.grnChecked = this.technicalChecked = this.supplierChecked = this.inventoryChecked = this.dispatchChecked =
        this.invoiceChecked = this.claimsChecked = this.portalChecked = false;
      return;
    }
    this.updateChecks(privileges);
  }

  updateChecks(privileges: Privileges) {
    this.dashboardChecked = privileges.dashboard.viewReport !== 'none',
      this.employeeChecked = privileges.employee.viewReport !== 'none',
      this.announcementChecked = privileges.announcement.viewReport !== 'none',
      this.customerChecked = privileges.customer.viewReport !== 'none',
      this.enquiryChecked = privileges.enquiry.viewReport !== 'none',
      this.assignedJobsChecked = privileges.assignedJob.viewReport !== 'none',
      this.quotationChecked = privileges.quotation.viewReport !== 'none',
      this.jobSheetChecked = privileges.jobSheet?.viewReport !== 'none',
      this.purchaseChecked = privileges.purchase?.viewReport !== 'none',
      this.purchaseOrderChecked = privileges.purchaseOrder ?
        ((privileges.purchaseOrder.viewReport ?? 'none') !== 'none' ||
         privileges.purchaseOrder.canInitiateLPO || privileges.purchaseOrder.canApprovePOs || privileges.purchaseOrder.canReissueAndRevoke) : false,
      this.grnChecked = privileges.grn ?
        ((privileges.grn.viewReport ?? 'none') !== 'none' || privileges.grn.canUploadInvoice) : false,
      this.technicalChecked = privileges.technical ?
        (privileges.technical.viewReport !== 'none' || privileges.technical.canViewOpenToWorkAndAssign || 
         privileges.technical.canTransferToEngineer || privileges.technical.canApproveMRRequests) : false,
      this.supplierChecked = privileges.supplier?.viewReport !== 'none',
      this.inventoryChecked = privileges.inventory ? 
        (privileges.inventory.products?.viewReport !== 'none' || privileges.inventory.stockEntries?.viewReport !== 'none') : false,
      this.dispatchChecked = privileges.dispatch
        ? privileges.dispatch.viewReport !== 'none' ||
          !!privileges.dispatch.createDeliveryNote ||
          !!privileges.dispatch.viewPendingDelivery ||
          !!privileges.dispatch.viewInvoiceLinking ||
          !!privileges.dispatch.viewInventoryDeduction
        : false,
      this.invoiceChecked = privileges.invoice
        ? privileges.invoice.viewReport !== 'none' ||
          !!privileges.invoice.createInvoice ||
          !!privileges.invoice.viewInvoicesVsDn ||
          !!privileges.invoice.viewCancelledAdjusted ||
          !!privileges.invoice.viewReissued
        : false,
      this.claimsChecked = privileges.claims?.viewReport !== 'none',
      this.portalChecked = privileges.portalManagement
        ? Object.values(privileges.portalManagement).some(value => value)
        : false;
  }

  get filteredModules(): PrivilegeModule[] {
    const q = this.privilegeSearch.trim().toLowerCase();
    if (!q) return this.privilegeModules;
    return this.privilegeModules.filter((m) =>
      m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.flags.some((f) => f.label.toLowerCase().includes(q)));
  }

  get enabledModuleCount(): number {
    return this.privilegeModules.filter((m) => this.hasAccess(m)).length;
  }

  /** Module shown in the detail pane; falls back to the first visible module. */
  get selectedModule(): PrivilegeModule | undefined {
    const list = this.filteredModules;
    return list.find((m) => m.key === this.selectedKey) ?? list[0];
  }

  ctrl(path: string): FormControl {
    return this.categoryForm.get('privileges.' + path) as FormControl;
  }

  /** Whether the module's settings are available (switched on, or it has no switch). */
  isOn(m: PrivilegeModule): boolean {
    return m.master ? this[m.master] : true;
  }

  /** Whether the role actually gets anything from this module. */
  hasAccess(m: PrivilegeModule): boolean {
    if (m.alwaysOn) return true;
    if (m.master) return this[m.master];
    return this.grantedFlags(m).length > 0;
  }

  grantedFlags(m: PrivilegeModule): PrivilegeFlag[] {
    return m.flags.filter((f) => !!this.ctrl(f.path)?.value);
  }

  scopeLabel(s: PrivilegeScope): string {
    return s.options.find((o) => o.value === this.ctrl(s.path)?.value)?.label ?? 'Not set';
  }

  toggleModule(m: PrivilegeModule, checked: boolean): void {
    if (!m.master || !m.group) return;
    this.onCheckboxChange(checked, m.group, m.master);
    this.categoryForm.markAsDirty();
    this.selectedKey = m.key;
  }

  selectModule(m: PrivilegeModule): void {
    this.selectedKey = m.key;
  }

  /** Bulk-set every module: no access, view-only (all records, no actions) or full access. */
  applyPreset(level: 'none' | 'view' | 'full'): void {
    for (const m of this.privilegeModules) {
      if (m.alwaysOn) continue;
      if (m.master && m.group) this.onCheckboxChange(level !== 'none', m.group, m.master);
      if (level === 'none') {
        m.flags.forEach((f) => this.ctrl(f.path)?.setValue(false));
        continue;
      }
      for (const s of m.scopes) {
        const c = this.ctrl(s.path);
        if (c && !c.disabled) c.setValue(s.options.some((o) => o.value === 'all') ? 'all' : s.options[0].value);
      }
      m.flags.forEach((f) => this.ctrl(f.path)?.setValue(level === 'full'));
    }
    this.categoryForm.markAsDirty();
  }

  onCheckboxChange(checked: boolean, formControlName: string, checkedVariable: CheckKey): void {

    if (formControlName === 'purchaseOrder') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', canInitiateLPO: false, canApprovePOs: false, canReissueAndRevoke: false } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', canInitiateLPO: false, canApprovePOs: false, canReissueAndRevoke: false } } });
      }
    } else if (formControlName === 'purchase') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', canApprovePR: false } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', canApprovePR: false } } });
      }
    } else if (formControlName === 'grn') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', canUploadInvoice: false } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', canUploadInvoice: false } } });
      }
    } else if (formControlName === 'inventory') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { products: { viewReport: 'all' }, stockEntries: { viewReport: 'all' } } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { products: { viewReport: 'none' }, stockEntries: { viewReport: 'none' } } } });
      }
    } else if (formControlName === 'dispatch') {
      if (checked) {
        this.categoryForm.patchValue({
          privileges: {
            dispatch: {
              viewReport: 'all',
              createDeliveryNote: false,
              viewPendingDelivery: false,
              viewInvoiceLinking: false,
              viewInventoryDeduction: false,
            },
          },
        });
      } else {
        this.categoryForm.patchValue({
          privileges: {
            dispatch: {
              viewReport: 'none',
              createDeliveryNote: false,
              viewPendingDelivery: false,
              viewInvoiceLinking: false,
              viewInventoryDeduction: false,
            },
          },
        });
      }
    } else if (formControlName === 'invoice') {
      if (checked) {
        this.categoryForm.patchValue({
          privileges: {
            invoice: {
              viewReport: 'all',
              createInvoice: false,
              viewInvoicesVsDn: false,
              viewCancelledAdjusted: false,
              viewReissued: false,
            },
          },
        });
      } else {
        this.categoryForm.patchValue({
          privileges: {
            invoice: {
              viewReport: 'none',
              createInvoice: false,
              viewInvoicesVsDn: false,
              viewCancelledAdjusted: false,
              viewReissued: false,
            },
          },
        });
      }
    } else if (checked) {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', create: false, canApprove: false } } });
    } else {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', create: false, canApprove: false } } });
    }

    this[checkedVariable] = checked;

  }

  startEditing(): void {
    this.viewing = false;
    this.categoryForm.enable({ emitEvent: false });
    if (!this.categoryForm.get('isSalespersonWithTarget')?.value) this.dashboardGroup.get('compareAgainst')?.disable();
  }

  onClose(discarded = false): void {
    if (discarded || this.isEdit) this.reset();
    this.closed.emit();
  }

  onSubmit(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    this.error = '';
    const categoryData = this.categoryForm.getRawValue() as unknown as GetCategory;
    const request = this.isEdit
      ? this._employeeService.updateCategory(categoryData, this.category?._id)
      : this._employeeService.createCategory(categoryData);

    request.subscribe({
      next: (data) => {
        this.isSaving = false;
        this._toast.success(this.isEdit ? 'Role updated successfully' : 'Role created successfully');
        this.saved.emit(data as GetCategory);
      },
      error: (error) => {
        this.isSaving = false;
        this.error = typeof error.error === 'string' ? error.error : (error.error?.message ?? 'Failed to save role');
      },
    });
  }
}
