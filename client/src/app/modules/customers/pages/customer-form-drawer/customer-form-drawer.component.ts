import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { CreateCustomerTypeDialog } from 'src/app/modules/settings/pages/create-customer-type/create-customer-type.component';
import { CreateDepartmentDialog } from 'src/app/modules/settings/pages/create-department/create-department.component';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getCustomerType } from 'src/app/shared/interfaces/customerType.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';

/**
 * Create and edit a customer in a slide-over.
 * The host binds `open`, `mode` and (for edit) `customer`, and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-customer-form-drawer',
  standalone: true,
  templateUrl: './customer-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, NgIcon, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class CustomerFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The customer being edited, as the by-client-ref API returns it (populated department and type). */
  @Input() customer: getCustomer | null = null;
  /** Fires after the server accepted the create or edit. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  step: 1 | 2 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Company' },
    { n: 2 as const, label: 'Contacts' },
  ];
  saving = false;
  companyExists = false;
  canCreateDepartment = false;
  canCreateCustomerType = false;

  departmentOptions: SfOption[] = [];
  customerDepartmentOptions: SfOption[] = [];
  customerTypeOptions: SfOption[] = [];
  readonly titleOptions: SfOption[] = [
    { label: 'Mr', value: 'Mr' },
    { label: 'Ms', value: 'Ms' },
  ];

  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private customerService = inject(CustomerService);
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private subscriptions = new Subscription();
  private optionsLoaded = false;
  private companyNameWatched = false;

  customerForm = this.fb.group({
    department: [null as string | null, Validators.required],
    companyName: ['', Validators.required],
    companyAddress: ['', Validators.required],
    customerType: [null as string | null, Validators.required],
    customerEmailId: ['', [Validators.required, Validators.email]],
    contactNo: ['', Validators.required],
    contactDetails: this.fb.array([this.newContact()]),
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
    this.reset();
    if (this.isEdit && this.customer) this.seed(this.customer);
    this.watchCompanyName();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
    }) as unknown as FormGroup;
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
      this.profileService.getDepartments().subscribe((res: getDepartment[]) => {
        this.departmentOptions = res.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerDepartments().subscribe((res: getDepartment[]) => {
        this.customerDepartmentOptions = res.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getCustomerTypes().subscribe((res: getCustomerType[]) => {
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

  // --- form state ------------------------------------------------------------

  private readonly stepControls: Record<1 | 2, string[]> = {
    1: ['department', 'companyName', 'companyAddress', 'customerType', 'customerEmailId', 'contactNo'],
    2: ['contactDetails'],
  };

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2): boolean {
    return this.stepControls[step].every((name) => this.customerForm.get(name)?.valid);
  }

  /** True once the user has interacted with (or tried to submit) a control of this step. */
  isStepTouched(step: 1 | 2): boolean {
    return this.stepControls[step].some((name) => this.customerForm.get(name)?.touched);
  }

  private markStepTouched(step: 1 | 2): void {
    this.stepControls[step].forEach((name) => this.customerForm.get(name)?.markAllAsTouched());
  }

  goToStep(step: 1 | 2): void {
    // Forward moves must pass every step in between; going back is always allowed.
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        if (!this.isStepValid(s as 1 | 2)) {
          this.markStepTouched(s as 1 | 2);
          this.step = s as 1 | 2;
          return;
        }
      }
    }
    this.step = step;
  }

  nextStep(): void {
    this.goToStep(2);
  }

  previousStep(): void {
    this.step = 1;
  }

  private reset(): void {
    this.step = 1;
    this.companyExists = false;
    this.contactDetails.clear();
    this.contactDetails.push(this.newContact());
    this.customerForm.reset({
      department: null, companyName: '', companyAddress: '', customerType: null, customerEmailId: '', contactNo: '',
    });
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
      customerType: id(c.customerType),
      customerEmailId: c.customerEmailId,
      contactNo: String(c.contactNo ?? ''),
    });
    this.customerForm.markAsPristine();
    this.customerForm.markAsUntouched();
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

  // --- closing / saving --------------------------------------------------------

  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.reset();
    this.closed.emit();
  }

  submit(): void {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      this.step = this.isStepValid(1) ? 2 : 1;
      this.toaster.warning('Check the fields properly!', 'Warning !');
      return;
    }

    this.saving = true;
    this.companyExists = false;
    const payload: any = this.customerForm.getRawValue();
    payload.contactDetails = payload.contactDetails.map((c: any) => {
      const { _id, ...rest } = c;
      return _id ? { ...rest, _id } : rest;
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
        const edit = this.isEdit;
        this.reset();
        this.closed.emit();
        this.saved.emit();
        this.toaster.success(edit ? 'Customer updated.' : 'Customer added!', edit ? 'Updated' : 'Success');
      },
      error: () => (this.saving = false),
    });
  }
}
