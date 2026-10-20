import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';

import { SupplierService } from 'src/app/core/services/supplier.service';
import { PartyMatch } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { MasterListName, MasterListService } from 'src/app/core/services/master-list.service';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { ibanValidator, integerValidator, notBlankValidator, swiftValidator, phoneValidator, strictEmailValidator } from 'src/app/shared/validators/form-field.validators';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ModalService } from 'src/app/shared/components/modal/modal.service';
import { MasterListItemDialog, MasterListItemDialogData, MasterListItemResult } from 'src/app/modules/settings/pages/master-data/master-list-item-dialog.component';
import { canEditBanking } from '../../supplier-banking-access';
import { CollapsibleCardComponent } from 'src/app/shared/components/collapsible-card/collapsible-card.component';
import { SupplierFormStepperComponent } from '../../components/form-stepper/form-stepper.component';

type StepNumber = 1 | 2 | 3 | 4;

/**
 * The supplier create/edit form in a slide-over, modeled on `customer-form-drawer.component.ts`'s
 * stepper pattern: Details (supplier + one or more addresses), Contacts (one or more, one primary),
 * Documents and — for super admins only — Banking (super admin only, all optional).
 * Products are not entered here; they are added in the product catalogue.
 * The host binds `open`, `mode` and (for edit) `supplier`, and reacts to `saved` / `closed`.
 */
let nextFormId = 0;

@Component({
  selector: 'app-supplier-form-drawer',
  standalone: true,
  templateUrl: './supplier-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, CollapsibleCardComponent, SupplierFormStepperComponent],
})
export class SupplierFormDrawerComponent implements OnChanges, OnDestroy {
  /** Several drawers can sit in the DOM at once (list page, quote, RFQ), so a shared id would send Create to the wrong form. */
  readonly formId = `supplier-form-${nextFormId++}`;
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The supplier being edited, as the list API returns it. */
  @Input() supplier: Supplier | null = null;
  /** Emits the saved supplier on create (the server's record), nothing on edit. */
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  step: StepNumber = 1;
  canBanking = false;

  /** Kept as a stable array: a getter returning fresh objects re-rendered the stepper on every change
   *  detection pass, which destroyed the button between mousedown and mouseup so clicks never landed. */
  steps: { n: StepNumber; label: string }[] = this.buildSteps();

  get lastStep(): number { return this.steps.length; }

  saving = false;
  /** Documents already stored on the supplier (edit mode). Removing one only drops it locally —
   *  see memory note "Supplier doc delete not cloud-synced": the backend update is all-or-nothing,
   *  so the file is actually removed only once the form is saved again. */
  existingDocuments: { fileName: string; originalname: string }[] = [];
  newDocuments: File[] = [];
  /** Bank documents. The server's create/update endpoints only accept a single `documents` file
   *  array (see SupplierService.createSupplierWithFiles/updateSupplierWithFiles) — there is no
   *  separate field for banking attachments. They are merged into the same `documents` array sent to the server. */
  newBankDocuments: File[] = [];

  /** Both lists come from Supplier Data in settings; a saved value stays selectable even if removed. */
  supplierTypeOptions: SfOption[] = [];
  categoryOptions: SfOption[] = [];
  masterDataFeedback = '';

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private modal = inject(ModalService);
  private supplierService = inject(SupplierService);
  private masterList = inject(MasterListService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();
  private duplicateWatched = false;
  /** Suppliers that already use this name, IBAN, email or phone; refreshed as the user types. */
  duplicateMatches: PartyMatch[] = [];
  get hasBlock(): boolean { return this.duplicateMatches.some((m) => m.level === 'block'); }

  /** Checks the name, primary contact and IBAN against the server as the user types, instead of waiting for submit. */
  private watchDuplicates(): void {
    if (this.duplicateWatched) return;
    this.duplicateWatched = true;
    this.subscriptions.add(
      this.supplierForm.valueChanges.pipe(
        debounceTime(400),
        switchMap(() => {
          const v = this.supplierForm.getRawValue();
          // The company's own email/phone and every salesperson's are checked; they may repeat within this supplier.
          const clean = (list: any[]) => [...new Set(list.map((x) => (x ?? '').trim()).filter(Boolean))];
          const probe = {
            supplierName: (v.supplierName ?? '').trim(),
            email: clean([v.companyEmail, ...(v.contacts as any[]).map((c) => c.email)]),
            phone: clean([v.companyPhone, ...(v.contacts as any[]).map((c) => c.phoneNumber)]),
            iban: clean((v.bankAccounts as any[]).map((b) => b.iban)),
          };
          if (!probe.supplierName && !probe.email.length && !probe.phone.length && !probe.iban.length) return of({ matches: [] as PartyMatch[] });
          return this.supplierService.checkDuplicate(probe, this.isEdit ? this.supplier?._id : undefined)
            .pipe(catchError(() => of({ matches: [] as PartyMatch[] })));
        }),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ).subscribe((r) => (this.duplicateMatches = r.matches))
    );
  }

  supplierForm = this.fb.group({
    supplierId: [{ value: 'NT-SP-', disabled: true }],
    supplierName: ['', [Validators.required, notBlankValidator(), Validators.maxLength(150)]],
    companyEmail: ['', [strictEmailValidator()]],
    companyPhone: ['', [phoneValidator()]],
    website: ['', [Validators.pattern(/^(https?:\/\/)?[^\s.\/]+(\.[^\s.\/]+)+(\/\S*)?$/i)]],
    supplierType: [null as string | null, Validators.required],
    category: [null as string | null, Validators.required],
    addresses: this.fb.array([this.newAddress(true)]),
    contacts: this.fb.array([this.newContact(true)]),
    bankAccounts: this.fb.array([this.newBankAccount(true)]),
    creditDays: [30 as number | null, [Validators.min(0), Validators.max(999), integerValidator()]],
    creditValue: [0 as number | null, [Validators.min(0)]],
  });

  get addresses(): FormArray<FormGroup> { return this.supplierForm.controls.addresses as FormArray<FormGroup>; }
  get bankAccounts(): FormArray<FormGroup> { return this.supplierForm.controls.bankAccounts as FormArray<FormGroup>; }
  get contacts(): FormArray<FormGroup> { return this.supplierForm.controls.contacts as FormArray<FormGroup>; }

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Supplier' : 'Create Supplier'; }

  get subtitle(): string {
    return this.isEdit && this.supplier ? `${this.supplier.supplierId}` : 'Add a new supplier record';
  }

  private readonly stepControls: Record<StepNumber, string[]> = {
    1: ['supplierName', 'companyEmail', 'companyPhone', 'website', 'category', 'supplierType', 'creditDays', 'creditValue', 'addresses'],
    2: ['contacts'],
    3: [],
    4: ['bankAccounts'],
  };

  private buildSteps(): { n: StepNumber; label: string }[] {
    const steps: { n: StepNumber; label: string }[] = [{ n: 1, label: 'Details' }, { n: 2, label: 'Contacts' }, { n: 3, label: 'Documents' }];
    if (this.canBanking) steps.push({ n: 4, label: 'Banking' });
    return steps;
  }

  private newAddress(primary = false): FormGroup {
    return this.fb.group({
      label: [''],
      isPrimary: [primary],
      location: [''],
      city: [''],
      streetNo: [''],
      buildingNo: [''],
      zoneNo: [''],
      poBox: [''],
    });
  }

  private newBankAccount(primary = false): FormGroup {
    return this.fb.group({
      isPrimary: [primary],
      bankName: [''],
      branch: [''],
      accountName: [''],
      accountNumber: [''],
      iban: ['', [ibanValidator()]],
      swiftCode: ['', [swiftValidator()]],
      currency: [''],
      bankCountry: [''],
      bankAddress: [''],
    });
  }

  private newContact(primary = false): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, notBlankValidator()]],
      designation: [''],
      email: ['', [Validators.required, strictEmailValidator()]],
      phoneNumber: ['', [Validators.required, phoneValidator()]],
      isPrimary: [primary],
    });
  }

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: StepNumber): boolean {
    return this.stepControls[step].every((name) => this.supplierForm.get(name)?.valid);
  }

  /** True once the user has interacted with (or tried to submit) a control of this step. */
  isStepTouched(step: StepNumber): boolean {
    return this.stepControls[step].some((name) => this.supplierForm.get(name)?.touched);
  }

  private markStepTouched(step: StepNumber): void {
    this.stepControls[step].forEach((name) => this.supplierForm.get(name)?.markAllAsTouched());
    // Re-open collapsed address / bank cards that hold errors so the user can see them.
    [...this.addresses.controls, ...this.contacts.controls, ...this.bankAccounts.controls].forEach((g) => {
      if (g.invalid) this.collapsedCards.delete(g);
    });
  }

  /** Address and bank-account cards the user has folded away. */
  collapsedCards = new Set<AbstractControl>();

  toggleCard(group: AbstractControl): void {
    if (!this.collapsedCards.delete(group)) this.collapsedCards.add(group);
  }

  addressSummary(g: AbstractControl): string {
    const v = g.value;
    return [v.label, v.location, v.city].filter(Boolean).join(' · ');
  }

  contactSummary(g: AbstractControl): string {
    const v = g.value;
    return [v.name, v.designation, v.email].filter(Boolean).join(' · ');
  }

  bankSummary(g: AbstractControl): string {
    const v = g.value;
    return [v.bankName, v.iban || v.accountNumber].filter(Boolean).join(' · ');
  }

  goToStep(step: StepNumber): void {
    // Forward moves must pass every step in between; going back is always allowed.
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        if (!this.isStepValid(s as StepNumber)) {
          this.markStepTouched(s as StepNumber);
          this.step = s as StepNumber;
          this.toaster.warning(`Complete ${this.steps.find((item) => item.n === this.step)?.label || 'this step'}: ${this.invalidFieldLabels(this.step).join(', ')}`);
          return;
        }
      }
    }
    this.step = step;
  }

  nextStep(): void {
    this.goToStep((this.step + 1) as StepNumber);
  }

  previousStep(): void {
    this.step = (this.step - 1) as StepNumber;
  }

  constructor() {
    this.subscriptions.add(this.employeeService.employeeData$.subscribe((e) => {
      this.canBanking = canEditBanking(e);
      this.steps = this.buildSteps();
    }));
    this.subscriptions.add(
      this.supplierForm.controls.category.valueChanges.subscribe((categoryId) => this.onCategoryChange(categoryId))
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    if (!this.open || !(opened || changes['supplier'])) return;

    this.loadOptions();
    this.watchDuplicates();
    this.duplicateMatches = [];
    if (this.isEdit) {
      if (this.supplier) this.seedFromSupplier(this.supplier);
    } else {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Reloaded on every open so items added in Supplier Data show up without a page refresh. */
  private loadOptions(): void {
    const s = this.isEdit ? this.supplier : null;
    const currentCategory = (s?.category as any)?._id ?? null;
    this.subscriptions.add(
      this.masterList.getItems('supplierCategory').subscribe((res) => {
        this.categoryOptions = (res.data ?? [])
          .filter((i) => i.isActive || i._id === currentCategory)
          .map((i) => ({ label: i.label, value: i._id }));
      })
    );
    this.subscriptions.add(
      this.masterList.getOptions('supplierType', { current: s?.supplierType, fallback: ['OEM', 'Distributor', 'Super Stockiest', 'Reseller'] }).subscribe((opts) => (this.supplierTypeOptions = opts))
    );
  }

  /** Adds an item to a master list from the form itself, then selects it. */
  createMasterListItem(list: Extract<MasterListName, 'supplierCategory' | 'supplierType'>): void {
    const title = list === 'supplierCategory' ? 'Category' : 'Supplier type';
    const ref = this.modal.open<MasterListItemResult, MasterListItemDialogData>(MasterListItemDialog, { width: '480px', data: { title } });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.masterList.createItem(list, result).subscribe({
        next: (res) => {
          if (list === 'supplierCategory') {
            this.categoryOptions = [...this.categoryOptions, { label: res.data.label, value: res.data._id }];
            this.supplierForm.controls.category.setValue(res.data._id);
            this.masterDataFeedback = `Category "${res.data.label}" created and selected.`;
          } else {
            this.supplierTypeOptions = [...this.supplierTypeOptions, { label: res.data.label, value: res.data.label }];
            this.supplierForm.controls.supplierType.setValue(res.data.label);
            this.masterDataFeedback = `Supplier type "${res.data.label}" created and selected.`;
          }
          this.toaster.success(this.masterDataFeedback);
        },
        error: (e) => this.toaster.error(e?.error?.message || 'Could not add item'),
      });
    });
  }

  /** Live-preview the next supplier id as the category changes, mirroring the old full-page form. */
  private onCategoryChange(categoryId: string | null): void {
    if (!categoryId) {
      this.supplierForm.controls.supplierId.setValue('NT-SP-');
      return;
    }
    this.supplierService.previewSupplierId(categoryId).subscribe({
      next: (response) => {
        const preview = this.isEdit
          ? this.applyDepartmentToExistingCode(response.data.departmentCode)
          : response.data.supplierId;
        this.supplierForm.controls.supplierId.setValue(preview);
      },
      error: () => {},
    });
  }

  private applyDepartmentToExistingCode(departmentCode: string): string {
    const current = this.supplierForm.controls.supplierId.value as string;
    const parts = current?.split('-');
    if (parts?.length === 4) { parts[2] = departmentCode; return parts.join('-'); }
    return current;
  }

  private seedFromSupplier(s: Supplier): void {
    this.resetForm();
    this.step = 1;
    this.supplierForm.patchValue({
      supplierId: s.supplierId || 'NT-SP-',
      supplierName: s.supplierName || '',
      supplierType: s.supplierType || null,
      category: (s.category as any)?._id || (s.category as any) || null,
      creditDays: s.creditDays ?? 30,
      creditValue: s.creditValue ?? 0,
      companyEmail: s.companyEmail || '',
      companyPhone: s.companyPhone || '',
      website: s.website || '',
    });

    // Suppliers saved before multiple addresses/contacts existed carry only the single legacy record.
    const addresses = s.addresses?.length ? s.addresses : s.address ? [s.address] : [];
    if (addresses.length) {
      this.addresses.clear();
      addresses.forEach((a) => {
        const group = this.newAddress();
        group.patchValue({
          label: a.label || '', location: a.location || '', city: a.city || '', streetNo: a.streetNo || '',
          buildingNo: a.buildingNo || '', zoneNo: a.zoneNo || '', poBox: a.poBox || '', isPrimary: !!a.isPrimary,
        });
        this.addresses.push(group);
      });
      if (!this.addresses.controls.some((g) => g.value.isPrimary)) this.addresses.at(0).patchValue({ isPrimary: true });
    }

    // Suppliers saved before multiple accounts existed carry only the single `bankDetails` record.
    const banks = s.bankAccounts?.length ? s.bankAccounts : s.bankDetails ? [{ ...s.bankDetails, isPrimary: true }] : [];
    if (banks.length) {
      this.bankAccounts.clear();
      banks.forEach((b) => {
        const group = this.newBankAccount();
        group.patchValue({
          bankName: b.bankName || '', branch: b.branch || '', accountName: b.accountName || '', accountNumber: b.accountNumber || '',
          iban: b.iban || '', swiftCode: b.swiftCode || '', currency: b.currency || '', bankCountry: b.bankCountry || '',
          bankAddress: b.bankAddress || '', isPrimary: !!b.isPrimary,
        });
        this.bankAccounts.push(group);
      });
      if (!this.bankAccounts.controls.some((g) => g.value.isPrimary)) this.bankAccounts.at(0).patchValue({ isPrimary: true });
    }

    const contacts = s.contacts?.length ? s.contacts : s.contactDetails ? [{ ...s.contactDetails, isPrimary: true }] : [];
    if (contacts.length) {
      this.contacts.clear();
      contacts.forEach((c) => {
        const group = this.newContact();
        group.patchValue({
          name: c.name || '', designation: c.designation || '', email: c.email || '',
          phoneNumber: c.phoneNumber || '', isPrimary: !!c.isPrimary,
        });
        this.contacts.push(group);
      });
      if (!this.contacts.controls.some((g) => g.value.isPrimary)) this.contacts.at(0).patchValue({ isPrimary: true });
    }

    this.existingDocuments = (s.documents || []).map((d) => ({ fileName: d.fileName, originalname: d.fileName }));
    this.newDocuments = [];
    this.newBankDocuments = [];

    this.supplierForm.markAsPristine();
    this.supplierForm.markAsUntouched();
  }

  private resetForm(): void {
    this.step = 1;
    this.duplicateMatches = [];
    this.existingDocuments = [];
    this.newDocuments = [];
    this.newBankDocuments = [];
    this.addresses.clear();
    this.addresses.push(this.newAddress(true));
    this.bankAccounts.clear();
    this.bankAccounts.push(this.newBankAccount(true));
    this.contacts.clear();
    this.contacts.push(this.newContact(true));
    this.supplierForm.reset({
      supplierId: 'NT-SP-', supplierName: '', companyEmail: '', companyPhone: '', website: '', supplierType: null, category: null,
      creditDays: 30, creditValue: 0,
    });
    this.contacts.at(0).patchValue({ isPrimary: true });
  }

  // --- addresses & contacts ----------------------------------------------------------------

  addAddress(): void {
    this.addresses.push(this.newAddress());
  }

  async removeAddress(index: number): Promise<void> {
    if (this.addresses.length <= 1) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Remove address?',
      message: 'Are you sure you want to remove this address?',
      consequence: 'Any details entered for it will be lost.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const wasPrimary = !!this.addresses.at(index).value.isPrimary;
    this.addresses.removeAt(index);
    if (wasPrimary) this.addresses.at(0).patchValue({ isPrimary: true });
    this.supplierForm.markAsDirty();
  }

  setPrimaryAddress(target: FormGroup): void {
    this.addresses.controls.forEach((g) => g.patchValue({ isPrimary: g === target }));
    this.supplierForm.markAsDirty();
  }

  addBankAccount(): void {
    this.bankAccounts.push(this.newBankAccount());
  }

  async removeBankAccount(index: number): Promise<void> {
    if (this.bankAccounts.length <= 1) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Remove bank account?',
      message: 'Are you sure you want to remove this bank account?',
      consequence: 'Any details entered for it will be lost.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const wasPrimary = !!this.bankAccounts.at(index).value.isPrimary;
    this.bankAccounts.removeAt(index);
    if (wasPrimary) this.bankAccounts.at(0).patchValue({ isPrimary: true });
    this.supplierForm.markAsDirty();
  }

  setPrimaryBankAccount(target: FormGroup): void {
    this.bankAccounts.controls.forEach((g) => g.patchValue({ isPrimary: g === target }));
    this.supplierForm.markAsDirty();
  }

  addContact(): void {
    this.contacts.push(this.newContact());
  }

  async removeContact(index: number): Promise<void> {
    if (this.contacts.length <= 1) return;
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Remove contact?',
      message: 'Are you sure you want to remove this contact?',
      consequence: 'Any details entered for them will be lost.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const wasPrimary = !!this.contacts.at(index).value.isPrimary;
    this.contacts.removeAt(index);
    if (wasPrimary) this.contacts.at(0).patchValue({ isPrimary: true });
    this.supplierForm.markAsDirty();
  }

  setPrimaryContact(target: FormGroup): void {
    this.contacts.controls.forEach((g) => g.patchValue({ isPrimary: g === target }));
    this.supplierForm.markAsDirty();
  }

  removeExistingDocument(index: number): void {
    this.existingDocuments.splice(index, 1);
  }

  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.resetForm();
    this.closed.emit();
  }

  cancel(): void {
    this.onDrawerClosed(false);
  }

  /** Accounts the user actually filled in; a blank one is just an unused row. */
  private get filledBankAccounts(): Record<string, any>[] {
    return (this.supplierForm.getRawValue().bankAccounts as Record<string, any>[])
      .map((b) => this.trimValues(b))
      .filter((b) => Object.entries(b).some(([k, v]) => k !== 'isPrimary' && !!(v ?? '').toString().trim()));
  }

  private trimValues<T>(group: T): T {
    return Object.fromEntries(
      Object.entries(group as Record<string, any>).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    ) as T;
  }

  private buildPayload(confirmDuplicates = false): any {
    const v = this.supplierForm.getRawValue();
    const employeeId = this.employeeService.employeeToken()?.id;
    return {
      supplierName: v.supplierName?.trim(),
      companyEmail: (v.companyEmail ?? '').trim(),
      companyPhone: (v.companyPhone ?? '').trim(),
      website: (v.website ?? '').trim(),
      addresses: (v.addresses as any[]).map((a) => this.trimValues(a)),
      supplierType: v.supplierType,
      category: v.category,
      contacts: (v.contacts as any[]).map((c) => this.trimValues(c)),
      // Non-finance editors never see the banking step: omit the field so the server keeps what is stored.
      bankAccounts: !this.canBanking ? undefined : this.filledBankAccounts.length ? this.filledBankAccounts : (this.isEdit ? null : undefined),
      creditDays: v.creditDays,
      creditValue: v.creditValue,
      ...(this.isEdit ? {} : { createdBy: employeeId }),
      ...(confirmDuplicates ? { confirmDuplicates: true } : {}),
    };
  }

  async submit(confirmDuplicates = false): Promise<void> {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      this.step = ([1, 2, 4] as StepNumber[]).find((s) => !this.isStepValid(s)) ?? 1;
      this.markStepTouched(this.step);
      this.toaster.error(`Complete ${this.steps.find((s) => s.n === this.step)?.label || 'this step'}: ${this.invalidFieldLabels(this.step).join(', ')}`);
      return;
    }

    const hard = this.duplicateMatches.find((m) => m.level === 'block');
    if (hard) {
      this.step = 1;
      this.toaster.error(`${hard.reason}. Use the existing supplier instead.`);
      return;
    }

    // Creating is already confirmed by pressing Create; only edits ask first.
    if (!confirmDuplicates && this.isEdit) {
      const { confirmed } = await this.confirm.open({
        tone: 'note',
        title: 'Save changes',
        confirmLabel: 'Save',
        message: `Save changes to "${this.supplierForm.value.supplierName?.trim()}"?`,
      });
      if (!confirmed) return;
    }

    this.saving = true;
    // Bank documents have no dedicated backend field, so they ride along in the same
    // `documents` array as the general attachments (see the class-level note above).
    const seen = new Set<string>();
    const files = [...this.newDocuments, ...this.newBankDocuments].filter((f) => {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      return seen.has(key) ? false : (seen.add(key), true);
    });

    if (this.isEdit && this.supplier?._id) {
      this.supplierService.updateSupplierWithFiles(this.supplier._id, this.buildPayload(confirmDuplicates), files).subscribe({
        next: () => { this.saving = false; this.finish(); this.toaster.success('Supplier updated successfully'); },
        error: (error) => { this.saving = false; void this.onSaveError(error, 'Failed to update supplier'); },
      });
    } else {
      this.supplierService.createSupplierWithFiles(this.buildPayload(confirmDuplicates), files).subscribe({
        next: (res) => { this.saving = false; this.finish(res?.data); this.toaster.success('Supplier created successfully'); },
        error: (error) => { this.saving = false; void this.onSaveError(error, 'Failed to create supplier'); },
      });
    }
  }

  invalidFieldLabels(step: StepNumber): string[] {
    const labels: Record<string, string> = {
      supplierName: 'Supplier Name', companyEmail: 'Company Email', companyPhone: 'Company Phone', website: 'Website',
      category: 'Category', supplierType: 'Supplier Type', creditDays: 'Credit Days', creditValue: 'Credit Limit',
    };
    if (step === 1) {
      const fields = Object.entries(labels).filter(([key]) => this.supplierForm.get(key)?.invalid).map(([, label]) => label);
      this.addresses.controls.forEach((address, index) => { if (address.invalid) fields.push(`Address ${index + 1}`); });
      return fields;
    }
    if (step === 2) return this.contacts.controls.flatMap((contact, index) => contact.invalid ? [`Contact ${index + 1}`] : []);
    return this.bankAccounts.controls.flatMap((bank, index) => bank.invalid ? [`Bank account ${index + 1}`] : []);
  }

  /** A duplicate warning asks the user whether to save anyway; every other error is shown as a toast. */
  private async onSaveError(error: any, fallback: string): Promise<void> {
    const body = error?.error;
    if (body?.matches) this.duplicateMatches = body.matches;
    if (!body?.duplicateWarning) {
      this.toaster.error(body?.message || fallback);
      return;
    }
    this.step = 1;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Similar supplier found',
      message: `${(body.matches as PartyMatch[]).map((m) => m.reason).join('. ')}. Save this as a separate supplier anyway?`,
      confirmLabel: 'Save anyway',
    });
    if (confirmed) void this.submit(true);
  }

  private finish(saved?: any): void {
    this.resetForm();
    this.closed.emit();
    this.saved.emit(saved);
  }
}
