import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';

import { SupplierService } from 'src/app/core/services/supplier.service';
import { PartyMatch } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { ibanValidator, integerValidator, notBlankValidator, swiftValidator, phoneValidator, strictEmailValidator } from 'src/app/shared/validators/form-field.validators';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { canAccessBanking } from '../../supplier-banking-access';
import { SupplierFormStepperComponent } from '../../components/form-stepper/form-stepper.component';

/**
 * The supplier create/edit form in a slide-over, modeled on `customer-form-drawer.component.ts`'s
 * 3-step stepper pattern: Details (supplier/address/contact), Documents and — for the finance team only — Banking.
 * Products are not entered here; they are added in the product catalogue.
 * The host binds `open`, `mode` and (for edit) `supplier`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-supplier-form-drawer',
  standalone: true,
  templateUrl: './supplier-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, SupplierFormStepperComponent],
})
export class SupplierFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The supplier being edited, as the list API returns it. */
  @Input() supplier: Supplier | null = null;
  /** Emits the saved supplier on create (the server's record), nothing on edit. */
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  step: 1 | 2 | 3 = 1;
  canBanking = false;

  get steps(): { n: 1 | 2 | 3; label: string }[] {
    const steps: { n: 1 | 2 | 3; label: string }[] = [{ n: 1, label: 'Details' }, { n: 2, label: 'Documents' }];
    if (this.canBanking) steps.push({ n: 3, label: 'Banking' });
    return steps;
  }

  get lastStep(): number { return this.steps.length; }

  saving = false;
  /** Documents already stored on the supplier (edit mode). Removing one only drops it locally —
   *  see memory note "Supplier doc delete not cloud-synced": the backend update is all-or-nothing,
   *  so the file is actually removed only once the form is saved again. */
  existingDocuments: { fileName: string; originalname: string }[] = [];
  newDocuments: File[] = [];
  /** Bank documents. The server's create/update endpoints only accept a single `documents` file
   *  array (see SupplierService.createSupplierWithFiles/updateSupplierWithFiles) — there is no
   *  separate field for banking attachments. The old full-page form collected these into
   *  `bankDocumentFiles` but never actually sent them, so they were silently dropped. Fixed here by
   *  merging them into the same `documents` array sent to the server, rather than losing them again. */
  newBankDocuments: File[] = [];

  supplierTypeOptions: SfOption[] = [
    { label: 'OEM', value: 'OEM' },
    { label: 'Distributor', value: 'Distributor' },
    { label: 'Super Stockiest', value: 'Super Stockiest' },
    { label: 'Reseller', value: 'Reseller' },
  ];
  categoryOptions: SfOption[] = [];

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private supplierService = inject(SupplierService);
  private profileService = inject(ProfileService);
  private employeeService = inject(EmployeeService);
  private subscriptions = new Subscription();
  private optionsLoaded = false;
  private duplicateWatched = false;
  /** Suppliers that already use this name, IBAN, email or phone; refreshed as the user types. */
  duplicateMatches: PartyMatch[] = [];
  get hasBlock(): boolean { return this.duplicateMatches.some((m) => m.level === 'block'); }

  /** Checks the name, contact and IBAN against the server as the user types, instead of waiting for submit. */
  private watchDuplicates(): void {
    if (this.duplicateWatched) return;
    this.duplicateWatched = true;
    this.subscriptions.add(
      this.supplierForm.valueChanges.pipe(
        debounceTime(400),
        switchMap(() => {
          const v = this.supplierForm.getRawValue();
          const probe = {
            supplierName: (v.supplierName ?? '').trim(),
            email: (v.contactDetails?.email ?? '').trim(),
            phone: (v.contactDetails?.phoneNumber ?? '').trim(),
            iban: (v.bankDetails?.iban ?? '').trim(),
          };
          if (!probe.supplierName && !probe.email && !probe.phone && !probe.iban) return of({ matches: [] as PartyMatch[] });
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
    address: this.fb.group({
      streetNo: [''],
      zoneNo: [''],
      buildingNo: [''],
      poBox: [''],
      city: [''],
      location: ['', [Validators.required, notBlankValidator()]],
    }),
    supplierType: [null as string | null, Validators.required],
    category: [null as string | null, Validators.required],
    contactDetails: this.fb.group({
      name: ['', [Validators.required, notBlankValidator()]],
      email: ['', [Validators.required, strictEmailValidator()]],
      phoneNumber: ['', [Validators.required, phoneValidator()]],
    }),
    bankDetails: this.fb.group({
      bankName: [''],
      branch: [''],
      accountName: [''],
      accountNumber: [''],
      iban: ['', [ibanValidator()]],
      swiftCode: ['', [swiftValidator()]],
      currency: [''],
      bankCountry: [''],
      bankAddress: [''],
    }),
    creditDays: [30, [Validators.required, Validators.min(0), Validators.max(999), integerValidator()]],
    creditValue: [0, [Validators.required, Validators.min(0)]],
  });

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Supplier' : 'Create Supplier'; }

  get subtitle(): string {
    return this.isEdit && this.supplier ? `${this.supplier.supplierId}` : 'Add a new supplier record';
  }

  private readonly stepControls: Record<1 | 2 | 3, string[]> = {
    1: ['supplierName', 'category', 'supplierType', 'creditDays', 'creditValue', 'address', 'contactDetails'],
    2: [],
    3: [],
  };

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].every((name) => this.supplierForm.get(name)?.valid);
  }

  /** True once the user has interacted with (or tried to submit) a control of this step. */
  isStepTouched(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].some((name) => this.supplierForm.get(name)?.touched);
  }

  private markStepTouched(step: 1 | 2 | 3): void {
    this.stepControls[step].forEach((name) => this.supplierForm.get(name)?.markAllAsTouched());
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

  constructor() {
    this.subscriptions.add(this.employeeService.employeeData$.subscribe((e) => (this.canBanking = canAccessBanking(e))));
    this.subscriptions.add(
      this.supplierForm.controls.category.valueChanges.subscribe((categoryId) => this.onCategoryChange(categoryId))
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    if (!this.open || !(opened || changes['supplier'])) return;

    this.ensureOptions();
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

  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.subscriptions.add(
      this.profileService.getDepartments().subscribe((departments: getDepartment[]) => {
        this.categoryOptions = departments.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
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
      address: {
        streetNo: s.address?.streetNo || '',
        zoneNo: s.address?.zoneNo || '',
        buildingNo: s.address?.buildingNo || '',
        poBox: s.address?.poBox || '',
        city: s.address?.city || '',
        location: s.address?.location || '',
      },
      contactDetails: {
        name: s.contactDetails?.name || '',
        email: s.contactDetails?.email || '',
        phoneNumber: s.contactDetails?.phoneNumber || '',
      },
      bankDetails: {
        bankName: s.bankDetails?.bankName || '',
        branch: s.bankDetails?.branch || '',
        accountName: s.bankDetails?.accountName || '',
        accountNumber: s.bankDetails?.accountNumber || '',
        iban: s.bankDetails?.iban || '',
        swiftCode: s.bankDetails?.swiftCode || '',
        currency: s.bankDetails?.currency || '',
        bankCountry: s.bankDetails?.bankCountry || '',
        bankAddress: s.bankDetails?.bankAddress || '',
      },
    });

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
    this.supplierForm.reset({
      supplierId: 'NT-SP-', supplierName: '', supplierType: null, category: null,
      address: { streetNo: '', zoneNo: '', buildingNo: '', poBox: '', city: '', location: '' },
      contactDetails: { name: '', email: '', phoneNumber: '' },
      bankDetails: { bankName: '', branch: '', accountName: '', accountNumber: '', iban: '', swiftCode: '', currency: '', bankCountry: '', bankAddress: '' },
      creditDays: 30, creditValue: 0,
    });
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

  /** True when every bank field is blank, i.e. the user opened the section but never filled it. */
  private get bankDetailsEmpty(): boolean {
    const bank = this.supplierForm.getRawValue().bankDetails as Record<string, string | null>;
    return Object.values(bank).every((v) => !(v ?? '').toString().trim());
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
      address: this.trimValues(v.address),
      supplierType: v.supplierType,
      category: v.category,
      contactDetails: this.trimValues(v.contactDetails),
      // Non-finance editors never see the banking step: omit the field so the server keeps what is stored.
      bankDetails: !this.canBanking ? undefined : this.bankDetailsEmpty ? (this.isEdit ? null : undefined) : this.trimValues(v.bankDetails),
      creditDays: v.creditDays,
      creditValue: v.creditValue,
      ...(this.isEdit ? {} : { createdBy: employeeId }),
      ...(confirmDuplicates ? { confirmDuplicates: true } : {}),
    };
  }

  async submit(confirmDuplicates = false): Promise<void> {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      this.step = 1;
      this.toaster.error('Please fill all required fields correctly');
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
        title: this.isEdit ? 'Save changes' : 'Create supplier',
        confirmLabel: this.isEdit ? 'Save' : 'Create',
        message: this.isEdit
          ? `Save changes to "${this.supplierForm.value.supplierName?.trim()}"?`
          : `Create supplier "${this.supplierForm.value.supplierName?.trim()}"?`,
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
