import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { HttpEventType } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { saveAs } from 'file-saver';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MasterListService } from 'src/app/core/services/master-list.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { CreateCustomerTypeDialog } from 'src/app/modules/hr/pages/create-customer-type/create-customer-type.component';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { CustomerAttachment, getCustomer, PAYMENT_TERMS, CREDIT_STATUSES } from 'src/app/shared/interfaces/customer.interface';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { CustomerAddressFieldsComponent } from '../../components/address-fields/address-fields.component';
import { CustomerContactRepeaterComponent } from '../../components/contact-repeater/contact-repeater.component';
import { CustomerFormStepperComponent } from '../../components/form-stepper/form-stepper.component';

/**
 * Create and edit a customer in a slide-over.
 * The host binds `open`, `mode` and (for edit) `customer`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-customer-form-drawer',
  standalone: true,
  templateUrl: './customer-form-drawer.component.html',
  imports: [NgIf, ReactiveFormsModule, FormsModule, SmartFormModule, ActionButtonComponent, DetailDocumentsComponent,
    CustomerAddressFieldsComponent, CustomerContactRepeaterComponent, CustomerFormStepperComponent],
})
export class CustomerFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The customer being edited, as the by-client-ref API returns it (populated department and type). */
  @Input() customer: getCustomer | null = null;
  /** Fires after the server accepted the create or edit. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  step: 1 | 2 | 3 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Company' },
    { n: 2 as const, label: 'Contacts' },
    { n: 3 as const, label: 'Commercial Terms' },
  ];
  saving = false;
  companyExists = false;
  duplicateField: 'email' | 'phone' | 'trn' | null = null;
  canCreateDepartment = false;
  canCreateCustomerType = false;

  attachments: CustomerAttachment[] = [];
  pendingFiles: File[] = [];
  uploadingAttachments = false;
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  departmentOptions: SfOption[] = [];
  customerDepartmentOptions: SfOption[] = [];
  customerTypeOptions: SfOption[] = [];
  readonly titleOptions: SfOption[] = [
    { label: 'Mr', value: 'Mr' },
    { label: 'Ms', value: 'Ms' },
  ];
  paymentTermsOptions: SfOption[] = PAYMENT_TERMS.map((t) => ({ label: t, value: t }));
  readonly creditStatusOptions: SfOption[] = CREDIT_STATUSES.map((s) => ({ label: s, value: s }));
  readonly currencyOptions: SfOption[] = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'].map((c) => ({ label: c, value: c }));
  private readonly defaultSources = ['Referral', 'Website', 'Walk-in', 'Cold Call', 'Exhibition', 'Existing Client', 'Other'];
  sourceOptions: SfOption[] = this.defaultSources.map((s) => ({ label: s, value: s }));

  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private masterList = inject(MasterListService);
  private subscriptions = new Subscription();
  private optionsLoaded = false;
  private companyNameWatched = false;

  customerForm = this.fb.group({
    department: [null as string | null, Validators.required],
    companyName: ['', Validators.required],
    companyAddress: ['', Validators.required],
    companyAddressStructured: this.newAddress(),
    sameAsBilling: [true],
    shippingAddress: [''],
    shippingAddressStructured: this.newAddress(),
    customerType: [null as string | null, Validators.required],
    customerEmailId: ['', [Validators.required, Validators.email]],
    contactNo: ['', Validators.required],
    trn: [''],
    paymentTerms: [null as string | null],
    creditLimit: [null as number | null],
    creditStatus: ['Good Standing' as string | null],
    taxExempt: [false],
    currency: ['QAR' as string | null],
    source: [null as string | null],
    shippingSites: this.fb.array([] as FormGroup[]),
    contactDetails: this.fb.array([this.newContact()]),
  });

  get contactDetails(): FormArray<FormGroup> {
    return this.customerForm.controls.contactDetails as FormArray<FormGroup>;
  }

  get shippingSites(): FormArray<FormGroup> {
    return this.customerForm.controls.shippingSites as FormArray<FormGroup>;
  }

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Customer' : 'Create Customer'; }

  get subtitle(): string {
    return this.isEdit && this.customer ? `${this.customer.clientRef} · ${this.customer.companyName}` : 'Company and contact details';
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.customerForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['customer'])) return;
    this.ensureOptions();
    this.loadMasterOptions();
    this.reset();
    if (this.isEdit && this.customer) this.seed(this.customer);
    this.watchCompanyName();
    this.watchSameAsBilling();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private newAddress(): FormGroup {
    return this.fb.group({
      line1: [''],
      line2: [''],
      city: [''],
      state: [''],
      country: [''],
      postalCode: [''],
    });
  }

  private newContact(): FormGroup {
    return this.fb.group({
      _id: [null as string | null],
      courtesyTitle: ['', Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNo: ['', Validators.required],
      department: [null as string | null, Validators.required],
      designation: [''],
      role: [null as string | null],
    }) as unknown as FormGroup;
  }

  /** Payment terms and source come from Settings → Master Data; a saved value stays selectable even if retired. */
  private loadMasterOptions(): void {
    const c = this.isEdit ? this.customer : null;
    this.subscriptions.add(
      this.masterList.getOptions('paymentTerms', { current: c?.paymentTerms, fallback: [...PAYMENT_TERMS] })
        .subscribe((o) => (this.paymentTermsOptions = o))
    );
    this.subscriptions.add(
      this.masterList.getOptions('source', { current: c?.source, fallback: this.defaultSources })
        .subscribe((o) => (this.sourceOptions = o))
    );
  }

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((e) => {
        this.canCreateDepartment = !!e?.category?.privileges?.portalManagement?.department;
        this.canCreateCustomerType = !!e?.category?.privileges?.portalManagement?.customerType;
      })
    );
    this.subscriptions.add(
      this.profileService.getDepartments(true).subscribe((res: getDepartment[]) => {
        this.departmentOptions = res.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerDepartments(true).subscribe((res: getDepartment[]) => {
        this.customerDepartmentOptions = res.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerTypes(true).subscribe((res: getCustomerType[]) => {
        this.customerTypeOptions = res.map((t) => ({ label: t.customerTypeName, value: t._id }));
      })
    );
  }

  /** Checks the company name against the server as the user types, instead of waiting for submit. */
  private watchCompanyName(): void {
    if (this.companyNameWatched) return;
    this.companyNameWatched = true;
    this.subscriptions.add(
      this.customerForm.controls.companyName.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe((name) => {
        this.companyExists = false;
        const trimmed = (name ?? '').trim();
        if (!trimmed) return;
        this.customerService.checkCompanyExists(trimmed, this.isEdit ? this.customer?._id : undefined).subscribe((res) => {
          this.companyExists = !!res.companyExist;
        });
      })
    );
  }

  private sameAsBillingWatched = false;

  /** Toggles shippingAddress's required-ness as sameAsBilling changes, and clears it when re-checked. */
  private watchSameAsBilling(): void {
    if (this.sameAsBillingWatched) return;
    this.sameAsBillingWatched = true;
    const shipping = this.customerForm.controls.shippingAddress;
    this.subscriptions.add(
      this.customerForm.controls.sameAsBilling.valueChanges.subscribe((same) => {
        if (same) {
          shipping.clearValidators();
          shipping.setValue('');
        } else {
          shipping.setValidators(Validators.required);
        }
        shipping.updateValueAndValidity();
      })
    );
  }

  // --- form state ------------------------------------------------------------

  private readonly stepControls: Record<1 | 2 | 3, string[]> = {
    1: ['department', 'companyName', 'companyAddress', 'shippingAddress', 'customerType', 'customerEmailId', 'contactNo', 'trn', 'shippingSites'],
    2: ['contactDetails'],
    3: ['paymentTerms', 'creditLimit', 'creditStatus', 'taxExempt', 'currency', 'source'],
  };

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].every((name) => this.customerForm.get(name)?.valid);
  }

  /** True once the user has interacted with (or tried to submit) a control of this step. */
  isStepTouched(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].some((name) => this.customerForm.get(name)?.touched);
  }

  private markStepTouched(step: 1 | 2 | 3): void {
    this.stepControls[step].forEach((name) => this.customerForm.get(name)?.markAllAsTouched());
  }

  goToStep(step: 1 | 2 | 3): void {
    // Forward moves must pass every step in between; going back is always allowed.
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        if (!this.isStepValid(s as 1 | 2 | 3)) {
          this.markStepTouched(s as 1 | 2 | 3);
          this.step = s as 1 | 2 | 3;
          return;
        }
      }
    }
    this.step = step;
  }

  nextStep(): void {
    this.goToStep((this.step + 1) as 1 | 2 | 3);
  }

  previousStep(): void {
    this.step = (this.step - 1) as 1 | 2 | 3;
  }

  private reset(): void {
    this.step = 1;
    this.companyExists = false;
    this.contactDetails.clear();
    this.contactDetails.push(this.newContact());
    this.shippingSites.clear();
    this.duplicateField = null;
    this.attachments = [];
    this.pendingFiles = [];
    this.customerForm.reset({
      department: null, companyName: '', companyAddress: '', sameAsBilling: true, shippingAddress: '', customerType: null, customerEmailId: '', contactNo: '', trn: '',
      paymentTerms: null, creditLimit: null, creditStatus: 'Good Standing', taxExempt: false, currency: 'QAR', source: null,
    });
    this.customerForm.controls.companyAddressStructured.reset();
    this.customerForm.controls.shippingAddressStructured.reset();
  }

  private seed(c: getCustomer): void {
    const id = (v: any): string | null => v?._id ?? (typeof v === 'string' ? v : null);
    this.contactDetails.clear();
    (c.contactDetails?.length ? c.contactDetails : [null]).forEach((contact: any) => {
      const group = this.newContact();
      if (contact) group.patchValue({ ...contact, department: id(contact.department) });
      this.contactDetails.push(group);
    });
    this.customerForm.patchValue({
      department: id(c.department),
      companyName: c.companyName,
      companyAddress: c.companyAddress,
      sameAsBilling: c.sameAsBilling ?? true,
      shippingAddress: c.shippingAddress ?? '',
      customerType: id(c.customerType),
      customerEmailId: c.customerEmailId,
      contactNo: String(c.contactNo ?? ''),
      trn: c.trn ?? '',
      paymentTerms: c.paymentTerms ?? null,
      creditLimit: c.creditLimit ?? null,
      creditStatus: c.creditStatus ?? 'Good Standing',
      taxExempt: c.taxExempt ?? false,
      currency: c.currency ?? 'QAR',
      source: c.source ?? null,
    });
    this.shippingSites.clear();
    (c.shippingSites ?? []).forEach((s) => {
      const g = this.newSite();
      g.patchValue({ siteName: s.siteName, address: s.address ?? {} });
      this.shippingSites.push(g);
    });
    this.customerForm.controls.companyAddressStructured.patchValue(c.companyAddressStructured ?? {});
    this.customerForm.controls.shippingAddressStructured.patchValue(c.shippingAddressStructured ?? {});
    const shipping = this.customerForm.controls.shippingAddress;
    shipping.setValidators(c.sameAsBilling ?? true ? [] : Validators.required);
    shipping.updateValueAndValidity();
    this.attachments = c.attachments ?? [];
    this.pendingFiles = [];
    this.customerForm.markAsPristine();
    this.customerForm.markAsUntouched();
  }

  private newSite(): FormGroup {
    return this.fb.group({ siteName: ['', Validators.required], address: this.newAddress() }) as unknown as FormGroup;
  }

  addSite(): void {
    this.shippingSites.push(this.newSite());
  }

  removeSite(index: number): void {
    this.shippingSites.removeAt(index);
    this.customerForm.markAsDirty();
  }

  addContact(): void {
    this.contactDetails.push(this.newContact());
  }

  async removeContact(index: number): Promise<void> {
    if (index <= 0) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Remove contact?',
      message: 'Are you sure you want to remove this contact?',
      consequence: 'Any details entered for them will be lost.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    this.contactDetails.removeAt(index);
    this.customerForm.markAsDirty();
  }

  // --- inline creation of settings entries -------------------------------------

  createCustomerDepartment(): void {
    this.dialog.open(CreateDepartmentDialog, { data: { forCustomer: true } }).afterClosed().subscribe((data) => {
      if (data) this.customerDepartmentOptions = [...this.customerDepartmentOptions, { label: data.departmentName, value: data._id }];
    });
  }

  createCustomerType(): void {
    this.dialog.open(CreateCustomerTypeDialog, { data: {} }).afterClosed().subscribe((data) => {
      if (data) this.customerTypeOptions = [...this.customerTypeOptions, { label: data.customerTypeName, value: data._id }];
    });
  }

  // --- attachments -------------------------------------------------------------

  attachmentDocuments(): DetailDocument[] {
    return this.attachments.map((f) => ({ id: f.fileName, name: f.originalname }));
  }

  attachmentRemoveDetails(doc: DetailDocument) {
    return [{ label: 'File Name', value: doc.name }];
  }

  /** Existing files are re-sent because the server replaces the whole set. */
  uploadPendingAttachments(): void {
    if (!this.pendingFiles.length || this.uploadingAttachments || !this.isEdit || !this.customer) return;
    const formData = new FormData();
    this.pendingFiles.forEach((file) => formData.append('files', file));
    if (this.attachments.length) formData.append('existingFiles', JSON.stringify(this.attachments));

    this.uploadingAttachments = true;
    this.customerService.updateCustomerAttachments(this.customer._id, formData).subscribe({
      next: (res: any) => {
        this.attachments = res.data?.attachments || [];
        this.pendingFiles = [];
        this.uploadingAttachments = false;
        this.toaster.success('Files uploaded successfully');
      },
      error: () => {
        this.uploadingAttachments = false;
        this.toaster.error('Failed to upload files');
      },
    });
  }

  onAttachmentDownload(doc: DetailDocument): void {
    this.customerService.downloadFile(doc.id).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.Response) saveAs(new Blob([event.body]), doc.name);
      },
      error: (error: any) => {
        if (error.status === 404) this.toaster.warning('Sorry, the requested file was not found on the server.');
        else this.toaster.error('An error occurred while downloading the file.');
      },
    });
  }

  onAttachmentRemove(doc: DetailDocument): void {
    if (!this.customer) return;
    this.customerService.removeCustomerAttachment(this.customer._id, doc.id).subscribe({
      next: (res: any) => {
        this.attachments = res?.data?.attachments ?? this.attachments.filter((f) => f.fileName !== doc.id);
        this.toaster.success('File deleted');
      },
      error: () => this.toaster.error('Failed to delete file'),
    });
  }

  private uploadAttachmentsFor(customerId: string): void {
    if (!this.pendingFiles.length) return;
    const formData = new FormData();
    this.pendingFiles.forEach((file) => formData.append('files', file));
    this.customerService.updateCustomerAttachments(customerId, formData).subscribe({
      next: () => (this.pendingFiles = []),
      error: () => this.toaster.error('Customer created, but attachment upload failed.'),
    });
  }

  // --- closing / saving --------------------------------------------------------

  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.reset();
    this.closed.emit();
  }

  submit(): void {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      this.step = !this.isStepValid(1) ? 1 : !this.isStepValid(2) ? 2 : 3;
      this.toaster.warning('Check the fields properly!', 'Warning !');
      return;
    }

    this.saving = true;
    this.companyExists = false;
    this.duplicateField = null;
    const payload: any = this.customerForm.getRawValue();
    payload.contactDetails = payload.contactDetails.map((c: any, i: number) => {
      const { _id, ...rest } = c;
      const withPrimary = { ...rest, isPrimary: i === 0 };
      return _id ? { ...withPrimary, _id } : withPrimary;
    });

    let request$;
    if (this.isEdit && this.customer) {
      payload.id = this.customer._id;
      payload.createdBy = this.employeeService.employeeToken().id;
      request$ = this.customerService.editCustomer(payload);
    } else {
      request$ = this.customerService.createCustomer(payload);
    }
    request$.subscribe({
      next: (res: any) => {
        this.saving = false;
        if (res.companyExist) {
          this.companyExists = true;
          this.step = 1;
          return;
        }
        if (res.duplicateExist) {
          this.duplicateField = res.duplicateField;
          this.step = 1;
          const fieldName = { email: 'email', phone: 'contact number', trn: 'TRN' }[res.duplicateField as 'email' | 'phone' | 'trn'] ?? 'value';
          this.toaster.warning(`Another customer already uses this ${fieldName}.`, 'Duplicate');
          return;
        }
        const edit = this.isEdit;
        if (!edit && res._id) this.uploadAttachmentsFor(res._id);
        this.reset();
        this.closed.emit();
        this.saved.emit();
        this.toaster.success(edit ? 'Customer updated.' : 'Customer added!', edit ? 'Updated' : 'Success');
      },
      error: () => (this.saving = false),
    });
  }
}
