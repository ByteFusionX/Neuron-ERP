import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { HttpEventType } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { saveAs } from 'file-saver';
import { Subscription, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';
import { CustomerService, PartyMatch } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MasterListName, MasterListService } from 'src/app/core/services/master-list.service';
import { ModalService } from 'src/app/shared/components/modal/modal.service';
import { MasterListItemDialog, MasterListItemDialogData, MasterListItemResult } from 'src/app/modules/settings/pages/master-data/master-list-item-dialog.component';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { CreateCustomerTypeDialog } from 'src/app/modules/settings/pages/master-data/create-customer-type/create-customer-type.component';
import { CreateDepartmentDialog } from 'src/app/modules/hr/pages/create-department/create-department.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { CustomerAttachment, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { CustomerAddressFieldsComponent } from '../../components/address-fields/address-fields.component';
import { CustomerContactRepeaterComponent } from '../../components/contact-repeater/contact-repeater.component';
import { CustomerFormStepperComponent } from '../../components/form-stepper/form-stepper.component';
import { departmentPrivileges } from 'src/app/shared/utils/privilege-fallback';

/**
 * Create and edit a customer in a slide-over.
 * The host binds `open`, `mode` and (for edit) `customer`, and reacts to `saved` / `closed`.
 */
let nextFormId = 0;

@Component({
  selector: 'app-customer-form-drawer',
  standalone: true,
  templateUrl: './customer-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, ReactiveFormsModule, FormsModule, SmartFormModule, ActionButtonComponent, DetailDocumentsComponent,
    CustomerAddressFieldsComponent, CustomerContactRepeaterComponent, CustomerFormStepperComponent],
})
export class CustomerFormDrawerComponent implements OnChanges, OnDestroy {
  /** Several drawers can sit in the DOM at once (list page, enquiry), so a shared id would send Create to the wrong form. */
  readonly formId = `customer-form-${nextFormId++}`;
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The customer being edited, as the by-client-ref API returns it (populated department and type). */
  @Input() customer: getCustomer | null = null;
  /** Fires after the server accepted the create or edit. */
  @Output() saved = new EventEmitter<getCustomer>();
  @Output() closed = new EventEmitter<void>();

  step: 1 | 2 | 3 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Company' },
    { n: 2 as const, label: 'Contacts' },
    { n: 3 as const, label: 'Commercial Terms' },
  ];
  saving = false;
  companyExists = false;
  /** Customers that already use this name, TRN, email or phone; refreshed as the user types. */
  duplicateMatches: PartyMatch[] = [];
  private confirmDuplicates = false;
  get hasBlock(): boolean { return this.duplicateMatches.some((m) => m.level === 'block'); }
  duplicateField: 'email' | 'phone' | 'trn' | null = null;
  canCreateDepartment = false;
  canCreateCustomerType = false;

  attachments: CustomerAttachment[] = [];
  /** Files picked in step 3; uploaded only after the customer is saved. */
  readonly pendingFilesCtrl = new FormControl<File[]>([], { nonNullable: true });
  get pendingFiles(): File[] { return this.pendingFilesCtrl.value; }
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  departmentOptions: SfOption[] = [];
  customerDepartmentOptions: SfOption[] = [];
  customerTypeOptions: SfOption[] = [];
  readonly titleOptions: SfOption[] = [
    { label: 'Mr', value: 'Mr' },
    { label: 'Ms', value: 'Ms' },
    { label: 'Mrs', value: 'Mrs' },
    { label: 'Dr', value: 'Dr' },
    { label: 'Eng', value: 'Eng' },
    { label: 'Prof', value: 'Prof' },
  ];
  paymentTermsOptions: SfOption[] = [];
  creditStatusOptions: SfOption[] = [];
  currencyOptions: SfOption[] = [];
  sourceOptions: SfOption[] = [];

  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private masterList = inject(MasterListService);
  private modal = inject(ModalService);
  private subscriptions = new Subscription();
  private optionsLoaded = false;
  private companyNameWatched = false;
  private attemptedSteps = new Set<1 | 2 | 3>();

  customerForm = this.fb.group({
    department: [null as string | null],
    departments: [[] as string[], Validators.required],
    companyName: ['', Validators.required],
    companyAddress: ['', Validators.required],
    companyAddressStructured: this.newAddress(),
    sameAsBilling: [true],
    shippingAddress: [''],
    shippingAddressStructured: this.newAddress(),
    customerType: [null as string | null, Validators.required],
    customerEmailId: ['', [Validators.required, Validators.email]],
    contactNo: ['', [Validators.required, Validators.pattern(/^[0-9+()\-\s]{6,20}$/)]],
    trn: [''],
    paymentTerms: [null as string | null],
    creditLimit: [null as number | null],
    creditStatus: [null as string | null],
    currency: [null as string | null],
    source: [null as string | null],
    contactDetails: this.fb.array([this.newContact(true)]),
  });

  get contactDetails(): FormArray<FormGroup> {
    return this.customerForm.controls.contactDetails as FormArray<FormGroup>;
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
    this.subscriptions.add(this.pendingFilesCtrl.valueChanges.subscribe(() => this.customerForm.markAsDirty()));
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

  private newContact(primary = false): FormGroup {
    return this.fb.group({
      _id: [null as string | null],
      courtesyTitle: ['', Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNo: ['', Validators.required],
      department: [null as string | null, Validators.required],
      designation: [''],
      isPrimary: [primary],
    }) as unknown as FormGroup;
  }

  /** Payment terms, source, credit status and currency come from Customer Data in settings; a saved value stays selectable even if removed. */
  private loadMasterOptions(): void {
    const c = this.isEdit ? this.customer : null;
    const load = (list: 'paymentTerms' | 'source' | 'creditStatus' | 'currency', current: string | null | undefined, apply: (opts: SfOption[]) => void, defaultLabel?: string) =>
      this.subscriptions.add(
        this.masterList.getOptions(list, { current }).subscribe((opts) => {
          apply(opts);
          const control = this.customerForm.controls[list];
          if (defaultLabel && !this.isEdit && !control.value && opts.some((o) => o.value === defaultLabel)) control.setValue(defaultLabel);
        })
      );
    load('paymentTerms', c?.paymentTerms, (o) => (this.paymentTermsOptions = o));
    load('source', c?.source, (o) => (this.sourceOptions = o));
    load('creditStatus', c?.creditStatus, (o) => (this.creditStatusOptions = o), 'Good Standing');
    load('currency', c?.currency, (o) => (this.currencyOptions = o), 'QAR');
  }

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((e) => {
        this.canCreateDepartment = departmentPrivileges(e?.category?.privileges).create;
        this.canCreateCustomerType = !!e?.category?.privileges?.portalManagement?.customerType;
      })
    );
    this.subscriptions.add(
      this.profileService.getDepartments(true).subscribe((res: getDepartment[]) => {
        this.departmentOptions = res.map((d) => ({ label: this.normalizeOptionLabel(d.departmentName), value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerDepartments(true).subscribe((res: getDepartment[]) => {
        this.customerDepartmentOptions = res.map((d) => ({ label: this.normalizeOptionLabel(d.departmentName), value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerTypes(true).subscribe((res: getCustomerType[]) => {
        this.customerTypeOptions = res.map((t) => ({ label: this.normalizeOptionLabel(t.customerTypeName), value: t._id }));
      })
    );
  }

  /** Checks the company name against the server as the user types, instead of waiting for submit. */
  private watchCompanyName(): void {
    if (this.companyNameWatched) return;
    this.companyNameWatched = true;
    this.subscriptions.add(
      this.customerForm.valueChanges.pipe(
        debounceTime(400),
        switchMap(() => {
          const v = this.customerForm.getRawValue();
          const probe = {
            companyName: (v.companyName ?? '').trim(),
            email: (v.customerEmailId ?? '').trim(),
            phone: String(v.contactNo ?? '').trim(),
            trn: (v.trn ?? '').trim(),
          };
          if (!probe.companyName && !probe.email && !probe.phone && !probe.trn) return of({ matches: [] as PartyMatch[] });
          return this.customerService.checkDuplicate(probe, this.isEdit ? this.customer?._id : undefined)
            .pipe(catchError(() => of({ matches: [] as PartyMatch[] })));
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ).subscribe((r) => {
        this.duplicateMatches = r.matches;
        this.companyExists = r.matches.some((m) => m.level === 'block' && m.field === 'name');
        this.confirmDuplicates = false;
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
    1: ['departments', 'companyName', 'companyAddress', 'shippingAddress', 'customerType', 'customerEmailId', 'contactNo', 'trn'],
    2: ['contactDetails'],
    3: ['paymentTerms', 'creditLimit', 'creditStatus', 'currency', 'source'],
  };

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].every((name) => this.customerForm.get(name)?.valid);
  }

  /** Validation summaries appear only after the user tries to leave or submit a step. */
  isStepSubmitted(step: 1 | 2 | 3): boolean {
    return this.attemptedSteps.has(step);
  }

  private markStepTouched(step: 1 | 2 | 3): void {
    this.stepControls[step].forEach((name) => this.customerForm.get(name)?.markAllAsTouched());
  }

  goToStep(step: 1 | 2 | 3): void {
    // Forward moves must pass every step in between; going back is always allowed.
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        if (!this.isStepValid(s as 1 | 2 | 3)) {
          this.attemptedSteps.add(s as 1 | 2 | 3);
          this.markStepTouched(s as 1 | 2 | 3);
          this.step = s as 1 | 2 | 3;
          this.focusFirstInvalidControl();
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
    this.contactDetails.at(0).patchValue({ isPrimary: true });
    this.duplicateField = null;
    this.attachments = [];
    this.pendingFilesCtrl.setValue([], { emitEvent: false });
    this.attemptedSteps.clear();
    this.customerForm.reset({
      department: null, departments: [], companyName: '', companyAddress: '', sameAsBilling: true, shippingAddress: '', customerType: null, customerEmailId: '', contactNo: '', trn: '',
      paymentTerms: null, creditLimit: null, creditStatus: null, currency: null, source: null,
    });
    this.customerForm.controls.companyAddressStructured.reset();
    this.customerForm.controls.shippingAddressStructured.reset();
  }

  private seed(c: getCustomer): void {
    const id = (v: any): string | null => v?._id ?? (typeof v === 'string' ? v : null);
    const departmentIds = (c.departments?.length ? c.departments.map(id) : [id(c.department)]).filter(Boolean) as string[];
    this.contactDetails.clear();
    (c.contactDetails?.length ? c.contactDetails : [null]).forEach((contact: any) => {
      const group = this.newContact();
      if (contact) group.patchValue({ ...contact, department: id(contact.department) });
      this.contactDetails.push(group);
    });
    if (!this.contactDetails.controls.some((g) => g.value.isPrimary)) this.contactDetails.at(0).patchValue({ isPrimary: true });
    this.customerForm.patchValue({
      department: departmentIds[0] ?? null,
      departments: departmentIds,
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
      creditStatus: c.creditStatus ?? null,
      currency: c.currency ?? null,
      source: c.source ?? null,
    });
    this.customerForm.controls.companyAddressStructured.patchValue(c.companyAddressStructured ?? {});
    this.customerForm.controls.shippingAddressStructured.patchValue(c.shippingAddressStructured ?? {});
    const shipping = this.customerForm.controls.shippingAddress;
    shipping.setValidators(c.sameAsBilling ?? true ? [] : Validators.required);
    shipping.updateValueAndValidity();
    this.attachments = c.attachments ?? [];
    this.pendingFilesCtrl.setValue([], { emitEvent: false });
    this.customerForm.markAsPristine();
    this.customerForm.markAsUntouched();
  }

  private syncPrimaryDepartment(): void {
    const departments = this.customerForm.controls.departments.value ?? [];
    this.customerForm.controls.department.setValue(departments[0] ?? null);
  }

  addContact(): void {
    this.contactDetails.push(this.newContact());
  }

  async removeContact(index: number): Promise<void> {
    if (this.contactDetails.length <= 1) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Remove contact?',
      message: 'Are you sure you want to remove this contact?',
      consequence: 'Any details entered for them will be lost.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const wasPrimary = !!this.contactDetails.at(index).value.isPrimary;
    this.contactDetails.removeAt(index);
    if (wasPrimary) this.contactDetails.at(0).patchValue({ isPrimary: true });
    this.customerForm.markAsDirty();
  }

  // --- inline creation of settings entries -------------------------------------

  createCustomerDepartment(): void {
    this.dialog.open(CreateDepartmentDialog, { data: { forCustomer: true } }).afterClosed().subscribe((data) => {
      if (data) this.customerDepartmentOptions = [...this.customerDepartmentOptions, { label: this.normalizeOptionLabel(data.departmentName), value: data._id }];
    });
  }

  createCustomerType(): void {
    this.dialog.open(CreateCustomerTypeDialog, { data: {} }).afterClosed().subscribe((data) => {
      if (data) this.customerTypeOptions = [...this.customerTypeOptions, { label: this.normalizeOptionLabel(data.customerTypeName), value: data._id }];
    });
  }

  private readonly commercialListTitles: Record<MasterListName, string> = {
    paymentTerms: 'Payment term', source: 'Source', creditStatus: 'Credit status', currency: 'Currency',
  } as Record<MasterListName, string>;

  createMasterListItem(list: 'paymentTerms' | 'source' | 'creditStatus' | 'currency', control: 'paymentTermsOptions' | 'sourceOptions' | 'creditStatusOptions' | 'currencyOptions'): void {
    const ref = this.modal.open<MasterListItemResult, MasterListItemDialogData>(MasterListItemDialog, {
      width: '480px',
      data: { title: this.commercialListTitles[list], valueLabel: list === 'paymentTerms' ? 'Days' : undefined },
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.masterList.createItem(list, result).subscribe({
        next: (res) => {
          const opt = { label: res.data.label, value: res.data.label };
          this[control] = [...this[control], opt];
          this.customerForm.get(list)?.setValue(opt.value);
        },
        error: () => this.toaster.error('Could not add item'),
      });
    });
  }

  // --- attachments -------------------------------------------------------------

  attachmentDocuments(): DetailDocument[] {
    return this.attachments.map((f) => ({ id: f.fileName, name: f.originalname }));
  }

  attachmentRemoveDetails(doc: DetailDocument) {
    return [{ label: 'File Name', value: doc.name }];
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

  /** Runs after the customer is saved. Existing files are re-sent because the server replaces the whole set. */
  private uploadAttachmentsFor(customerId: string, existing: CustomerAttachment[]): void {
    if (!this.pendingFiles.length) return;
    const formData = new FormData();
    this.pendingFiles.forEach((file) => formData.append('files', file));
    if (existing.length) formData.append('existingFiles', JSON.stringify(existing));
    this.customerService.updateCustomerAttachments(customerId, formData).subscribe({
      next: () => this.saved.emit(),
      error: () => this.toaster.error('Customer saved, but the file upload failed. Re-open the customer to upload again.'),
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
      this.attemptedSteps.add(this.step);
      this.toaster.warning(this.firstInvalidMessage(), 'Complete required information');
      this.focusFirstInvalidControl();
      return;
    }

    const hard = this.duplicateMatches.find((m) => m.level === 'block');
    if (hard) {
      this.step = 1;
      this.toaster.error(`${hard.reason}. Use the existing customer instead.`, 'Duplicate');
      return;
    }

    this.saving = true;
    this.companyExists = false;
    this.duplicateField = null;
    this.syncPrimaryDepartment();
    const payload: any = this.customerForm.getRawValue();
    if (this.confirmDuplicates) payload.confirmDuplicates = true;
    payload.department = payload.departments?.[0] ?? null;
    payload.contactDetails = payload.contactDetails.map((c: any, i: number) => {
      const { _id, ...rest } = c;
      const hasPrimary = payload.contactDetails.some((x: any) => x.isPrimary);
      const withPrimary = { ...rest, isPrimary: hasPrimary ? !!c.isPrimary : i === 0 };
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
      next: async (res: any) => {
        this.saving = false;
        if (res.matches) this.duplicateMatches = res.matches;
        if (res.duplicateWarning) {
          this.step = 1;
          const { confirmed } = await this.confirm.open({
            tone: 'warning',
            title: 'Similar customer found',
            message: `${(res.matches as PartyMatch[]).map((m) => m.reason).join('. ')}. Save this as a new customer anyway?`,
            confirmLabel: 'Save anyway',
          });
          if (confirmed) {
            this.confirmDuplicates = true;
            this.submit();
          }
          return;
        }
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
        const customerId = edit ? this.customer?._id : res._id;
        if (customerId) this.uploadAttachmentsFor(customerId, edit ? this.attachments : []);
        this.saved.emit(res as getCustomer);
        this.reset();
        this.closed.emit();
        this.toaster.success(edit ? 'Customer updated.' : 'Customer added!', edit ? 'Updated' : 'Success');
      },
      error: () => (this.saving = false),
    });
  }

  private firstInvalidMessage(): string {
    const labels: Record<string, string> = {
      departments: 'Departments', companyName: 'Company Name', companyAddress: 'Billing Address',
      customerType: 'Customer Type', customerEmailId: 'Customer Email', contactNo: 'Contact Number',
      contactDetails: 'Contact Details',
    };
    const name = this.stepControls[this.step].find((controlName) => this.customerForm.get(controlName)?.invalid);
    return name ? `Complete the ${labels[name] ?? name} field.` : 'Complete the highlighted required fields.';
  }

  private focusFirstInvalidControl(): void {
    setTimeout(() => {
      const form = document.getElementById(this.formId);
      const invalid = form?.querySelector<HTMLElement>('.ng-invalid:not(form), [aria-invalid="true"]');
      invalid?.focus();
      invalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  private normalizeOptionLabel(value: string): string {
    return String(value || '').trim().replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ')
      .toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\b(It|Ict|Elv|Av)\b/g, (word) => word.toUpperCase());
  }
}
