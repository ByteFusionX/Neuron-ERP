import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';

import { SupplierService } from 'src/app/core/services/supplier.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { Supplier } from 'src/app/shared/interfaces/suppliers.interface';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SupplierFormStepperComponent } from '../../components/form-stepper/form-stepper.component';

/**
 * The supplier create/edit form in a slide-over, modeled on `customer-form-drawer.component.ts`'s
 * 3-step stepper pattern: Details (supplier/address/contact), Products, Bank Details & Documents.
 * The host binds `open`, `mode` and (for edit) `supplier`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-supplier-form-drawer',
  standalone: true,
  templateUrl: './supplier-form-drawer.component.html',
  imports: [NgIf, NgFor, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, SupplierFormStepperComponent],
})
export class SupplierFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The supplier being edited, as the list API returns it. */
  @Input() supplier: Supplier | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  step: 1 | 2 | 3 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Details' },
    { n: 2 as const, label: 'Products' },
    { n: 3 as const, label: 'Bank & Documents' },
  ];

  saving = false;
  showBankDetails = false;
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

  supplierForm = this.fb.group({
    supplierId: [{ value: 'NT-SP-', disabled: true }],
    supplierName: ['', Validators.required],
    address: this.fb.group({
      streetNo: [''],
      zoneNo: [''],
      buildingNo: [''],
      poBox: [''],
      city: [''],
      location: ['', Validators.required],
    }),
    supplierType: [null as string | null, Validators.required],
    category: [null as string | null, Validators.required],
    contactDetails: this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', Validators.required],
    }),
    bankDetails: this.fb.group({
      bankName: [''],
      branch: [''],
      accountName: [''],
      accountNumber: [''],
      iban: [''],
      swiftCode: [''],
      currency: [''],
      bankCountry: [''],
      bankAddress: [''],
    }),
    products: this.fb.array([] as any[]),
    creditDays: [30, [Validators.required, Validators.min(0)]],
    creditValue: [0, [Validators.required, Validators.min(0)]],
  });

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Supplier' : 'Create Supplier'; }

  get subtitle(): string {
    return this.isEdit && this.supplier ? `${this.supplier.supplierId}` : 'Add a new supplier record';
  }

  get products(): FormArray { return this.supplierForm.get('products') as FormArray; }

  private readonly stepControls: Record<1 | 2 | 3, string[]> = {
    1: ['supplierName', 'category', 'supplierType', 'creditDays', 'creditValue', 'address', 'contactDetails'],
    2: ['products'],
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
    this.subscriptions.add(
      this.supplierForm.controls.category.valueChanges.subscribe((categoryId) => this.onCategoryChange(categoryId))
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    if (!this.open || !(opened || changes['supplier'])) return;

    this.ensureOptions();
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
    if (parts?.length === 5) { parts[2] = departmentCode; return parts.join('-'); }
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
    this.showBankDetails = !!s.bankDetails?.bankName;

    this.products.clear();
    (s.products || []).forEach((p) => this.products.push(this.createProductGroup(p)));

    this.existingDocuments = (s.documents || []).map((d) => ({ fileName: d.fileName, originalname: d.fileName }));
    this.newDocuments = [];
    this.newBankDocuments = [];

    this.supplierForm.markAsPristine();
    this.supplierForm.markAsUntouched();
  }

  private resetForm(): void {
    this.step = 1;
    this.products.clear();
    this.existingDocuments = [];
    this.newDocuments = [];
    this.newBankDocuments = [];
    this.showBankDetails = false;
    this.supplierForm.reset({
      supplierId: 'NT-SP-', supplierName: '', supplierType: null, category: null,
      address: { streetNo: '', zoneNo: '', buildingNo: '', poBox: '', city: '', location: '' },
      contactDetails: { name: '', email: '', phoneNumber: '' },
      bankDetails: { bankName: '', branch: '', accountName: '', accountNumber: '', iban: '', swiftCode: '', currency: '', bankCountry: '', bankAddress: '' },
      creditDays: 30, creditValue: 0,
    });
  }

  private createProductGroup(product?: any) {
    return this.fb.group({
      productName: [product?.productName || '', Validators.required],
      paymentTerm: [product?.paymentTerm || '', Validators.required],
      contactName: [product?.contactName || ''],
      contactEmail: [product?.contactEmail || '', Validators.email],
      contactNo: [product?.contactNo || ''],
    });
  }

  addProduct(): void {
    this.products.push(this.createProductGroup());
  }

  removeProduct(index: number): void {
    this.products.removeAt(index);
  }

  toggleBankDetails(): void {
    this.showBankDetails = !this.showBankDetails;
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

  private buildPayload(): any {
    const v = this.supplierForm.getRawValue();
    const employeeId = this.employeeService.employeeToken()?.id;
    return {
      supplierName: v.supplierName,
      address: v.address,
      supplierType: v.supplierType,
      category: v.category,
      contactDetails: v.contactDetails,
      bankDetails: this.showBankDetails ? v.bankDetails : undefined,
      products: v.products,
      creditDays: v.creditDays,
      creditValue: v.creditValue,
      ...(this.isEdit ? {} : { createdBy: employeeId }),
    };
  }

  async submit(): Promise<void> {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      this.step = !this.isStepValid(1) ? 1 : !this.isStepValid(2) ? 2 : 3;
      this.toaster.error('Please fill all required fields correctly');
      return;
    }

    const { confirmed } = await this.confirm.open({
      tone: 'note',
      title: this.isEdit ? 'Save changes' : 'Create supplier',
      message: this.isEdit
        ? `Save changes to "${this.supplierForm.value.supplierName}"?`
        : `Create supplier "${this.supplierForm.value.supplierName}"? It will need approval before it can be used.`,
    });
    if (!confirmed) return;

    this.saving = true;
    // Bank documents have no dedicated backend field, so they ride along in the same
    // `documents` array as the general attachments (see the class-level note above).
    const files = [...this.newDocuments, ...this.newBankDocuments];

    if (this.isEdit && this.supplier?._id) {
      this.supplierService.updateSupplierWithFiles(this.supplier._id, this.buildPayload(), files).subscribe({
        next: () => { this.saving = false; this.finish(); this.toaster.success('Supplier updated successfully'); },
        error: (error) => { this.saving = false; this.toaster.error(error?.error?.message || 'Failed to update supplier'); },
      });
    } else {
      this.supplierService.createSupplierWithFiles(this.buildPayload(), files).subscribe({
        next: () => { this.saving = false; this.finish(); this.toaster.success('Supplier created successfully'); },
        error: (error) => {
          this.saving = false;
          this.toaster.error(error?.error?.message === 'Supplier already exists' ? 'Supplier already exists' : 'Failed to create supplier');
        },
      });
    }
  }

  private finish(): void {
    this.resetForm();
    this.closed.emit();
    this.saved.emit();
  }
}
