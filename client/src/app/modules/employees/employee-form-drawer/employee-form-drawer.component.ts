import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { CreateEmployee, GetCategory, getEmployeeDetails } from 'src/app/shared/interfaces/employee.interface';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

const CONTRACT_TYPES = ['permanent', 'fixed-term', 'probation', 'contractor', 'intern'];
const PASSWORD_PATTERN = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]).{8,}$/;

/**
 * Create / edit employee in a slide-over. The host binds `open`, `mode` and (for edit) `employee`,
 * and reacts to `saved` / `closed`.
 */
@Component({
  selector: 'app-employee-form-drawer',
  standalone: true,
  templateUrl: './employee-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, NgIcon, DatePipe, SmartFormModule, ActionButtonComponent],
})
export class EmployeeFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The employee being edited, as the view / list APIs return it. */
  @Input() employee: getEmployeeDetails | null = null;
  /** Fires after the server accepted the create or edit, with the saved record. */
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  saving = false;
  canViewCompensation = false;
  changePassword = false;
  step: 1 | 2 = 1;

  categoryOptions: SfOption[] = [];
  departmentOptions: SfOption[] = [];
  reportingOptions: SfOption[] = [];
  readonly contractTypeOptions: SfOption[] = CONTRACT_TYPES.map((t) => ({ label: t.charAt(0).toUpperCase() + t.slice(1), value: t }));
  readonly today = this.todayIso();

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private profileService = inject(ProfileService);
  private subscriptions = new Subscription();
  private optionsLoaded = false;
  private userRole = 'user';
  private actorId: string | undefined;
  private allCategories: GetCategory[] = [];

  employeeForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    contactNo: ['', Validators.required],
    dob: ['', Validators.required],
    dateOfJoining: ['', Validators.required],
    designation: ['', Validators.required],
    department: [null as string | null, Validators.required],
    category: [null as string | null, Validators.required],
    reportingTo: [null as string | null],
    effectiveDate: [''],
    changeReason: [''],
    contractType: [null as string | null],
    contractStart: [''],
    contractEnd: [''],
    probationEnd: [''],
    isTechnician: [false],
    isDriver: [false],
    isProjectManager: [false],
    driverLicense: this.fb.group({
      number: [''],
      licenseClass: [''],
      expiry: [''],
    }),
    compensation: this.fb.group({
      costRatePerHour: [null as number | null, Validators.min(0)],
      billingRate: [null as number | null, Validators.min(0)],
    }),
    password: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });

  constructor() {
    this.subscriptions.add(
      this.employeeService.employeeData$.subscribe((me) => {
        this.actorId = me?._id;
        this.userRole = me?.category?.role ?? 'user';
        this.canViewCompensation = this.userRole === 'superAdmin' || !!me?.category?.privileges?.employee?.viewCompensation;
        this.applyCategoryFilter();
      })
    );
  }

  get isEdit(): boolean { return this.mode === 'edit'; }
  get title(): string { return this.isEdit ? 'Edit Employee' : 'Create Employee'; }
  get subtitle(): string {
    return this.isEdit && this.employee ? `${this.employee.employeeId} · ${this.employee.firstName} ${this.employee.lastName}` : 'Add a new team member';
  }
  showStep(n: 1 | 2): boolean { return this.step === n; }

  private readonly stepOneFields = ['firstName', 'lastName', 'email', 'contactNo', 'dob', 'dateOfJoining', 'designation', 'department', 'category'] as const;

  readonly steps = [
    { n: 1 as const, label: 'Personal & job' },
    { n: 2 as const, label: 'Contract & more' },
  ];

  isStepValid(step: 1 | 2): boolean {
    return step === 2 || this.stepOneFields.every((k) => this.employeeForm.controls[k].valid);
  }

  goToStep(step: 1 | 2): void {
    if (step === 2 && !this.isStepValid(1)) {
      this.stepOneFields.forEach((k) => this.employeeForm.controls[k].markAsTouched());
      return;
    }
    this.step = step;
  }

  nextStep(): void { this.goToStep(2); }
  previousStep(): void { this.step = 1; }

  next(): void { this.nextStep(); }

  get passwordControl() { return this.employeeForm.controls.password; }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.employeeForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open || !(changes['open'] || changes['employee'])) return;
    this.ensureOptions();
    if (this.isEdit && this.employee) { this.step = 1; this.seedFromEmployee(this.employee); }
    else if (!this.isEdit) this.resetForm();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // --- options ---------------------------------------------------------------

  /** Roles, departments and the manager list are only fetched once the drawer is first opened. */
  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;
    this.loadCategories();
    this.subscriptions.add(
      this.profileService.getInternalDepartments(!this.isEdit).subscribe((deps) => {
        this.departmentOptions = deps.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.employeeService.getAllEmployees().subscribe((people) => {
        this.reportingOptions = people.map((p) => ({ label: `${p.firstName} ${p.lastName}`, value: p._id }));
      })
    );
  }

  private loadCategories(): void {
    this.subscriptions.add(
      this.employeeService.getCategory().subscribe((categories) => {
        this.allCategories = categories;
        this.applyCategoryFilter();
      })
    );
  }

  /** When creating, an admin can only hand out admin/user roles and a user only user roles. */
  private applyCategoryFilter(): void {
    let list = this.allCategories;
    if (!this.isEdit) {
      if (this.userRole === 'admin') list = list.filter((c) => c.role === 'admin' || c.role === 'user');
      else if (this.userRole === 'user') list = list.filter((c) => c.role === 'user');
    }
    this.categoryOptions = list.map((c) => ({ label: `${c.categoryName} - ${this.titleCase(c.role)}`, value: c._id }));
  }

  // --- seeding ---------------------------------------------------------------

  private seedFromEmployee(e: getEmployeeDetails): void {
    const day = (v?: string | null): string => (v ? v.substring(0, 10) : '');
    this.resetForm();
    this.employeeForm.patchValue({
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      contactNo: String(e.contactNo ?? ''),
      dob: day(e.dob),
      dateOfJoining: day(e.dateOfJoining),
      designation: e.designation,
      department: e.department?._id ?? null,
      category: e.category?._id ?? null,
      reportingTo: e.reportingTo?._id ?? null,
      contractType: e.contractType ?? null,
      contractStart: day(e.contractStart),
      contractEnd: day(e.contractEnd),
      probationEnd: day(e.probationEnd),
      isTechnician: !!e.isTechnician,
      isDriver: !!e.isDriver,
      isProjectManager: !!e.isProjectManager,
      driverLicense: {
        number: e.driverLicense?.number ?? '',
        licenseClass: e.driverLicense?.licenseClass ?? '',
        expiry: day(e.driverLicense?.expiry),
      },
      compensation: {
        costRatePerHour: e.compensation?.costRatePerHour ?? null,
        billingRate: e.compensation?.billingRate ?? null,
      },
    });
    this.employeeForm.markAsPristine();
    this.employeeForm.markAsUntouched();
  }

  private resetForm(): void {
    this.step = 1;
    this.changePassword = false;
    this.passwordControl.disable();
    this.employeeForm.reset({
      firstName: '', lastName: '', email: '', contactNo: '', dob: '', dateOfJoining: '', designation: '',
      department: null, category: null, reportingTo: null, effectiveDate: '', changeReason: '',
      contractType: null, contractStart: '', contractEnd: '', probationEnd: '',
      isTechnician: false, isDriver: false, isProjectManager: false,
      driverLicense: { number: '', licenseClass: '', expiry: '' },
      compensation: { costRatePerHour: null, billingRate: null },
      password: '',
    });
  }

  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private titleCase(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** Reporting-to choices, minus the employee being edited. */
  get reportingChoices(): SfOption[] {
    const self = this.employee?._id;
    return this.isEdit && self ? this.reportingOptions.filter((o) => o.value !== self) : this.reportingOptions;
  }

  // --- password (edit only) --------------------------------------------------

  enablePasswordChange(): void {
    this.changePassword = true;
    this.passwordControl.enable();
    this.passwordControl.setValue('');
  }

  generatePassword(): void {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = '!@#$%^&*()_+{}[]';
    const all = upper + lower + digits + symbols;
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)];

    let password = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
    for (let i = 4; i < 10; i++) password += pick(all);
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    this.passwordControl.setValue(password);
    this.passwordControl.markAsDirty();
  }

  // --- closing ---------------------------------------------------------------

  /** `discarded` is true when the user confirmed throwing away unsaved changes. */
  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.resetForm();
    this.closed.emit();
  }

  cancel(): void {
    this.drawer?.requestClose();
  }

  // --- saving ----------------------------------------------------------------

  private buildPayload(): CreateEmployee {
    const v = this.employeeForm.getRawValue();
    // Empty dates/strings would fail Mongoose casting; send them as undefined.
    const blank = <T>(x: T | '' | null): T | undefined => (x === '' || x === null ? undefined : x);

    const payload: any = {
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      contactNo: v.contactNo,
      dob: v.dob,
      dateOfJoining: v.dateOfJoining,
      designation: v.designation,
      department: v.department,
      category: v.category,
      reportingTo: v.reportingTo || null,
      contractType: blank(v.contractType),
      contractStart: blank(v.contractStart),
      contractEnd: blank(v.contractEnd),
      probationEnd: blank(v.probationEnd),
      isTechnician: !!v.isTechnician,
      isDriver: !!v.isDriver,
      isProjectManager: !!v.isProjectManager,
    };

    if (v.isDriver) {
      payload.driverLicense = {
        number: v.driverLicense.number,
        licenseClass: v.driverLicense.licenseClass,
        expiry: blank(v.driverLicense.expiry),
      };
    }
    if (this.canViewCompensation) {
      payload.compensation = {
        costRatePerHour: v.compensation.costRatePerHour ?? undefined,
        billingRate: v.compensation.billingRate ?? undefined,
      };
    }

    if (this.isEdit) {
      // The server treats this as the Mongo _id.
      payload.employeeId = this.employee?._id;
      payload.effectiveDate = blank(v.effectiveDate);
      payload.changeReason = blank(v.changeReason);
      if (this.changePassword && v.password) payload.password = v.password;
    } else {
      payload.createdBy = this.actorId;
    }
    return payload as CreateEmployee;
  }

  submit(): void {
    if (this.step === 1) {
      this.next();
      return;
    }
    if (this.employeeForm.invalid) {
      this.employeeForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    const request$ = this.isEdit
      ? this.employeeService.editEmployees(this.buildPayload())
      : this.employeeService.createEmployees(this.buildPayload());
    request$.subscribe({
      next: (res) => {
        this.saving = false;
        this.resetForm();
        this.closed.emit();
        this.saved.emit(res);
        this.toaster.success(this.isEdit ? 'Employee updated successfully' : 'Employee created successfully');
      },
      error: () => (this.saving = false),
    });
  }
}
