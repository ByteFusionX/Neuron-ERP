import { ALLOWED_UPLOAD_TYPES } from 'src/app/shared/constants/upload-types';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subscription, filter, of, firstValueFrom, shareReplay, switchMap, take } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerFormDrawerComponent } from 'src/app/modules/customers/pages/customer-form-drawer/customer-form-drawer.component';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { SfDraftDirective, SfDrawerComponent, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { dateRangeValidator, isoDateFromToday, notBlankValidator, notPastDateValidator } from 'src/app/shared/utils/form-validation.util';

/**
 * Create-enquiry slide-over. The host binds `open` and reacts to `saved` / `closed`.
 * Passing `enquiry` switches it to edit mode: the customer, department and dates stay as raised, the rest can change.
 * New enquiries are captured first. Quotation is started from the enquiry list after review.
 */
@Component({
  selector: 'app-enquiry-form-drawer',
  standalone: true,
  templateUrl: './enquiry-form-drawer.component.html',
  imports: [NgIf, NgFor, NgClass, DatePipe, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, CustomerFormDrawerComponent],
})
export class EnquiryFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  /** The enquiry being edited; leave null to create one. */
  @Input() enquiry: getEnquiry | null = null;
  /** Fires with the created enquiry. */
  @Output() saved = new EventEmitter<any>();
  /** Fires after an edit is saved. */
  @Output() updated = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDraftDirective) draft?: SfDraftDirective;
  @ViewChild(SfDrawerComponent) drawer?: SfDrawerComponent;

  saving = false;
  salesPersonName = '';
  step: 1 | 2 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Customer & Details' },
    { n: 2 as const, label: 'Requirement & Files' },
  ];
  private readonly stepControls: Record<1 | 2, string[]> = {
    1: ['client', 'contact', 'department', 'title', 'priority', 'source', 'estimatedCost', 'date', 'nextFollowUpDate'],
    2: ['requirement', 'attachments'],
  };
  readonly acceptedFiles = ALLOWED_UPLOAD_TYPES;

  customerOptions: SfOption[] = [];
  contactOptions: SfOption[] = [];
  departmentOptions: SfOption[] = [];
  /** Every active department; the visible list narrows to the chosen customer's own departments. */
  private allDepartmentOptions: SfOption[] = [];
  accountingManagerOptions: SfOption[] = [];
  private readonly defaultSources = ['Referral', 'Website', 'Walk-in', 'Cold Call', 'Exhibition', 'Existing Customer', 'Other'];
  private readonly defaultCategories = ['Product', 'Project', 'Both', 'Supply only', 'Installation'];
  private readonly defaultPriorities = ['Low', 'Normal', 'Urgent', 'Critical'];
  sourceOptions: SfOption[] = this.defaultSources.map((label) => ({ label, value: label }));
  categoryOptions: SfOption[] = this.defaultCategories.map((label) => ({ label, value: label }));
  priorityOptions: SfOption[] = this.defaultPriorities.map((label) => ({ label, value: label }));

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toaster = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private enquiryService = inject(EnquiryService);
  private employeeService = inject(EmployeeService);
  private customerService = inject(CustomerService);
  private profileService = inject(ProfileService);
  customerDrawerOpen = false;
  private employee$!: Observable<any>;
  private customers$!: Observable<getCustomer[]>;
  private salesPersonId = '';
  private optionsLoaded = false;
  private subscriptions = new Subscription();

  /** The enquiry number follows its date, so how far back it can be set is limited. */
  readonly maxBackdateDays = 90;

  enquiryForm = this.fb.group({
    client: [null as string | null, Validators.required],
    contact: [null as string | null, Validators.required],
    department: [null as string | null, Validators.required],
    title: ['', [Validators.required, notBlankValidator]],
    source: [null as string | null],
    enquiryCategory: [null as string | null],
    accountingManager: [null as string | null],
    estimatedCost: [null as number | null, [Validators.min(0)]],
    priority: ['Normal' as string | null],
    requirement: ['', [Validators.required, notBlankValidator]],
    followUpOutcome: [''],
    date: [this.todayIso(), [Validators.required, dateRangeValidator(isoDateFromToday(-this.maxBackdateDays), isoDateFromToday(0))]],
    nextFollowUpDate: [this.tomorrowIso(), [Validators.required, notPastDateValidator]],
    attachments: [[] as File[]],
  });

  constructor() {
    this.subscriptions.add(
      this.enquiryForm.controls.client.valueChanges.subscribe((clientId) => this.onClientChange(clientId))
    );
    this.subscriptions.add(
      this.customerService.customerCreated$.subscribe((customer) => {
        if (this.customerDrawerOpen) this.onCustomerSaved(customer);
      })
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.enquiryForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.ensureOptions();
      this.step = 1;
      if (this.enquiry) this.loadForEdit(this.enquiry);
    }
  }

  get isEdit(): boolean {
    return !!this.enquiry;
  }

  /** Fields that fix the enquiry's identity (number, customer, department, owner, dates) are shown read-only when editing. */

  private loadForEdit(e: getEnquiry): void {
    const id = (x: any): string | null => (x && typeof x === 'object' ? x._id : x) ?? null;
    // Locked fields stay enabled but read-only: a disabled control is never "valid", which blocked Next and Save.
    // Their date rules only apply when raising an enquiry, so an old date or a lapsed follow-up must not block an edit.
    this.enquiryForm.controls.date.clearValidators();
    this.enquiryForm.controls.nextFollowUpDate.clearValidators();
    this.salesPersonName = `${e.salesPerson?.firstName ?? ''} ${e.salesPerson?.lastName ?? ''}`.trim();
    if (!this.customerOptions.length && e.client) this.customerOptions = [{ label: e.client.companyName, value: e.client._id }];
    if (!this.departmentOptions.length && e.department) this.departmentOptions = [{ label: e.department.departmentName, value: e.department._id }];
    this.contactOptions = (e.client?.contactDetails || []).map((c: ContactDetail) => ({ label: `${c.firstName} ${c.lastName}`, value: c._id }));
    this.enquiryForm.patchValue({
      client: id(e.client),
      contact: id(e.contact),
      department: id(e.department),
      title: e.title,
      source: e.source ?? null,
      enquiryCategory: e.enquiryCategory ?? null,
      estimatedCost: e.estimatedCost ?? null,
      accountingManager: id(e.salesPerson),
      priority: e.priority || 'Normal',
      requirement: e.requirement || '',
      date: String(e.date || '').slice(0, 10),
      nextFollowUpDate: String(e.nextFollowUpDate || '').slice(0, 10),
    }, { emitEvent: false });
    this.enquiryForm.markAsPristine();
  }

  // --- stepping ----------------------------------------------------------------

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2): boolean {
    return this.stepControls[step].every((name) => this.enquiryForm.get(name)?.valid);
  }

  private markStepTouched(step: 1 | 2): void {
    this.stepControls[step].forEach((name) => this.enquiryForm.get(name)?.markAllAsTouched());
  }

  goToStep(step: 1 | 2): void {
    if (step > this.step && !this.isStepValid(this.step)) {
      this.markStepTouched(this.step);
      this.showFirstInvalidField(this.step);
      return;
    }
    this.step = step;
  }

  nextStep(): void {
    if (this.step < 2) this.goToStep(2);
  }

  previousStep(): void {
    if (this.step > 1) this.step = 1;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // --- options ---------------------------------------------------------------

  /** Customers, departments and the signed-in employee are only fetched once the drawer first opens. */
  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;

    const employee$ = this.employeeService.employeeData$.pipe(filter((e) => !!e?._id), take(1), shareReplay(1));
    this.subscriptions.add(
      employee$.subscribe((e) => {
        this.salesPersonName = `${e!.firstName} ${e!.lastName}`;
        this.salesPersonId = e!._id as string;
      })
    );
    this.employee$ = employee$;
    this.loadCustomers();
    this.subscriptions.add(
      this.profileService.getDepartments(true).subscribe((departments) => {
        this.allDepartmentOptions = departments.map((d) => ({ label: d.departmentName, value: d._id }));
        this.narrowDepartments(this.enquiryForm.controls.client.value);
      })
    );
    this.subscriptions.add(
      this.employeeService.getAllEmployees().subscribe((employees: getEmployee[]) => {
        this.accountingManagerOptions = employees.map((employee) => ({
          label: `${employee.firstName} ${employee.lastName}`.trim(),
          value: employee._id,
        })).filter((option): option is SfOption => !!option.value);
      })
    );
  }

  private loadCustomers(selectedCustomerId?: string): void {
    this.customers$ = this.employee$.pipe(
      switchMap((e) => this.customerService.getAllCustomers(e!._id as string)),
      shareReplay(1),
    );
    this.subscriptions.add(
      this.customers$.subscribe((customers) => {
        this.customerOptions = customers.map((c) => ({ label: c.companyName, value: c._id }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        if (selectedCustomerId && this.customerOptions.some((option) => option.value === selectedCustomerId)) {
          this.enquiryForm.controls.client.setValue(selectedCustomerId);
          this.enquiryForm.controls.client.markAsDirty();
        }
        // A restored draft may already name a client whose contacts are not listed yet.
        const clientId = this.enquiryForm.controls.client.value;
        if (clientId && clientId !== selectedCustomerId) this.loadContacts(clientId);
      })
    );
  }

  private onClientChange(clientId: string | null): void {
    this.enquiryForm.controls.contact.reset(null);
    this.contactOptions = [];
    this.narrowDepartments(null);
    if (clientId && this.optionsLoaded) this.loadContacts(clientId);
  }

  /** Departments do not depend on the customer; every active department is offered. */
  private narrowDepartments(_clientId: string | null, _customer?: getCustomer): void {
    this.departmentOptions = this.allDepartmentOptions;
  }

  private loadContacts(clientId: string): void {
    this.subscriptions.add(
      this.customers$.pipe(take(1)).subscribe((customers) => {
        const customer = customers.find((c) => c._id === clientId);
        this.contactOptions = (customer?.contactDetails || []).map((c: ContactDetail) => ({
          label: `${c.firstName} ${c.lastName}`,
          value: c._id,
        }));
        this.narrowDepartments(clientId, customer);
      })
    );
  }

  // --- closing ---------------------------------------------------------------

  /** `discarded` is true when the user confirmed throwing away unsaved changes. */
  onDrawerClosed(discarded: boolean): void {
    if (discarded || this.isEdit) this.reset();
    this.closed.emit();
  }

  /** Goes through the drawer so unsaved changes get the same discard prompt as X and Esc. */
  cancel(): void {
    this.drawer?.requestClose();
  }

  /** Opens the customer form in a drawer stacked over this one, so the enquiry stays as it is. */
  createCustomer(): void {
    this.customerDrawerOpen = true;
  }

  onCustomerSaved(customer: getCustomer): void {
    if (!customer?._id) return;
    const customerOption = { label: customer.companyName, value: customer._id };
    this.customerOptions = [
      ...this.customerOptions.filter((option) => option.value !== customer._id),
      customerOption,
    ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    this.enquiryForm.controls.client.setValue(customer._id);
    this.enquiryForm.controls.client.markAsDirty();
    this.contactOptions = (customer.contactDetails || []).map((contact: ContactDetail) => ({
      label: `${contact.firstName} ${contact.lastName}`.trim(),
      value: contact._id,
    }));
    const primaryContact = (customer.contactDetails || []).find((contact: any) => contact.isPrimary)
      ?? customer.contactDetails?.[0];
    this.enquiryForm.controls.contact.setValue(primaryContact?._id ?? null);
    this.narrowDepartments(customer._id, customer);
  }

  private reset(): void {
    // A half-written new enquiry is kept while someone edits another one.
    if (!this.isEdit) this.draft?.clear();
    this.enquiryForm.controls.date.setValidators([Validators.required, dateRangeValidator(isoDateFromToday(-this.maxBackdateDays), isoDateFromToday(0))]);
    this.enquiryForm.controls.nextFollowUpDate.setValidators([Validators.required, notPastDateValidator]);
    this.contactOptions = [];
    this.enquiryForm.reset({
      client: null,
      contact: null,
      department: null,
      title: '',
      source: null,
      enquiryCategory: null,
      estimatedCost: null,
      accountingManager: null,
      priority: 'Normal',
      requirement: '',
      followUpOutcome: '',
      date: this.todayIso(),
      nextFollowUpDate: this.tomorrowIso(),
      attachments: []
    });
    this.step = 1;
  }

  get earliestEnquiryDate(): string {
    return isoDateFromToday(-this.maxBackdateDays);
  }

  get today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Local calendar date as yyyy-MM-dd (toISOString would shift it by the UTC offset). */
  /** New enquiries start with a follow-up due tomorrow, so they do not show as due today straight away. */
  private tomorrowIso(): string { return this.todayIso(1); }

  private todayIso(addDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + addDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- saving ----------------------------------------------------------------

  private buildFormData(): FormData {
    const v = this.enquiryForm.getRawValue();
    const salesPerson = v.accountingManager || this.salesPersonId;
    const formData = new FormData();
    formData.append('enquiryData', JSON.stringify({
      client: v.client,
      contact: v.contact,
      department: v.department,
      salesPerson,
      accountingManager: v.accountingManager || undefined,
      title: v.title,
      source: v.source,
      enquiryCategory: v.enquiryCategory,
      estimatedCost: v.estimatedCost ?? undefined,
      priority: v.priority,
      requirement: v.requirement,
      followUpOutcome: v.followUpOutcome,
      date: v.date,
      nextFollowUpDate: v.nextFollowUpDate,
      attachments: null,
      presale: null,
      status: 'New',
    }));
    (v.attachments ?? []).forEach((file) => formData.append('attachments', file as Blob));
    return formData;
  }

  get enquiryOwnerName(): string {
    const selectedId = this.enquiryForm.controls.accountingManager.value;
    return selectedId
      ? this.accountingManagerOptions.find((option) => option.value === selectedId)?.label ?? this.salesPersonName
      : this.salesPersonName;
  }

  private isReady(): boolean {
    if (this.enquiryForm.invalid || !this.salesPersonId) {
      this.enquiryForm.markAllAsTouched();
      const firstIncomplete = ([1, 2] as const).find((s) => !this.isStepValid(s));
      if (firstIncomplete) this.step = firstIncomplete;
      this.toaster.warning(this.firstInvalidMessage(), 'Complete required information');
      this.showFirstInvalidField(this.step);
      return false;
    }
    return true;
  }

  /** Warns when the customer already has an open enquiry with a similar title. Resolves true to go ahead. */
  private async confirmNotDuplicate(): Promise<boolean> {
    const { client, title } = this.enquiryForm.getRawValue();
    let similar: { enquiryId: string; title: string; status: string }[] = [];
    try {
      similar = await firstValueFrom(this.enquiryService.findSimilarEnquiries(client as string, title as string));
    } catch {
      return true; // the check is advisory; never block creating on it
    }
    if (!similar.length) return true;
    const { confirmed } = await this.confirm.open({
      tone: 'warning',
      title: 'Similar enquiry already open',
      message: 'This customer already has open enquiries with a similar title: ' +
        similar.map((e) => `${e.enquiryId} "${e.title}" (${e.status})`).join('; ') + '.',
      consequence: 'Creating another may duplicate work.',
      confirmLabel: 'Create anyway',
      cancelLabel: 'Go back',
    });
    return confirmed;
  }

  private saveEdit(): void {
    if (this.saving || !this.enquiry) return;
    if (this.enquiryForm.invalid) {
      this.enquiryForm.markAllAsTouched();
      this.toaster.warning(this.firstInvalidMessage(), 'Complete required information');
      this.showFirstInvalidField(this.step);
      return;
    }
    const v = this.enquiryForm.getRawValue();
    this.saving = true;
    this.subscriptions.add(
      this.enquiryService.updateEnquiryDetails(this.enquiry._id, {
        title: v.title ?? '',
        contact: v.contact,
        priority: v.priority,
        source: v.source ?? '',
        enquiryCategory: v.enquiryCategory ?? '',
        requirement: v.requirement ?? '',
        estimatedCost: v.estimatedCost ?? null,
      }).pipe(
        switchMap(() => {
          const files = (v.attachments ?? []) as File[];
          if (!files.length) return of(null);
          const formData = new FormData();
          files.forEach((file) => formData.append('files', file as Blob));
          return this.enquiryService.updateEnquiryAttachments(this.enquiry!._id, formData);
        }),
      ).subscribe({
        next: () => {
          this.saving = false;
          this.reset();
          this.updated.emit();
        },
        error: () => (this.saving = false),
      })
    );
  }

  private firstInvalidMessage(): string {
    const labels: Record<string, string> = {
      client: 'Customer', contact: 'Contact', department: 'Department', title: 'Enquiry Title',
      date: 'Enquiry Date', nextFollowUpDate: 'Next Follow-up Date', requirement: 'Requirement',
    };
    const name = this.stepControls[this.step].find((controlName) => this.enquiryForm.get(controlName)?.invalid);
    return name ? `Complete the ${labels[name] ?? name} field.` : 'Complete the highlighted required fields.';
  }

  private showFirstInvalidField(step: 1 | 2): void {
    const controlName = this.stepControls[step].find((name) => this.enquiryForm.get(name)?.invalid);
    if (!controlName) return;
    setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`#enquiry-form [formControlName="${controlName}"]`);
      element?.focus();
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async submit(): Promise<void> {
    if (this.isEdit) return this.saveEdit();
    if (this.saving || !this.isReady()) return;
    this.saving = true;
    if (!(await this.confirmNotDuplicate())) {
      this.saving = false;
      return;
    }
    this.subscriptions.add(
      this.enquiryService.createEnquiry(this.buildFormData()).subscribe({
        next: (enquiry) => {
          this.saving = false;
          if (!enquiry) return;
          this.reset();
          this.saved.emit(enquiry);
        },
        error: () => (this.saving = false),
      })
    );
  }

}
