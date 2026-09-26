import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DatePipe, NgIf } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subscription, filter, firstValueFrom, shareReplay, switchMap, take } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { SfDraftDirective, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';

/**
 * Create-enquiry slide-over. The host binds `open` and reacts to `saved` / `closed`.
 * New enquiries are captured first. Quotation is started from the enquiry list after review.
 */
@Component({
  selector: 'app-enquiry-form-drawer',
  standalone: true,
  templateUrl: './enquiry-form-drawer.component.html',
  imports: [NgIf, DatePipe, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class EnquiryFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  /** Fires with the created enquiry. */
  @Output() saved = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(SfDraftDirective) draft?: SfDraftDirective;

  saving = false;
  salesPersonName = '';
  readonly acceptedFiles = '.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.msg,.dwg';

  customerOptions: SfOption[] = [];
  contactOptions: SfOption[] = [];
  departmentOptions: SfOption[] = [];
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
  private customers$!: Observable<getCustomer[]>;
  private salesPersonId = '';
  private optionsLoaded = false;
  private subscriptions = new Subscription();

  enquiryForm = this.fb.group({
    client: [null as string | null, Validators.required],
    contact: [null as string | null, Validators.required],
    department: [null as string | null, Validators.required],
    title: ['', Validators.required],
    source: [null as string | null],
    enquiryCategory: [null as string | null],
    priority: ['Normal' as string | null],
    requirement: [''],
    followUpOutcome: [''],
    date: [this.todayIso(), Validators.required],
    nextFollowUpDate: [this.todayIso(), Validators.required],
    attachments: [[] as File[]],
  });

  constructor() {
    this.subscriptions.add(
      this.enquiryForm.controls.client.valueChanges.subscribe((clientId) => this.onClientChange(clientId))
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.enquiryForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) this.ensureOptions();
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
    this.customers$ = employee$.pipe(
      switchMap((e) => this.customerService.getAllCustomers(e!._id as string)),
      shareReplay(1),
    );
    this.subscriptions.add(
      this.customers$.subscribe((customers) => {
        this.customerOptions = customers.map((c) => ({ label: c.companyName, value: c._id }));
        // A restored draft may already name a client whose contacts are not listed yet.
        const clientId = this.enquiryForm.controls.client.value;
        if (clientId) this.loadContacts(clientId);
      })
    );
    this.subscriptions.add(
      this.profileService.getDepartments(true).subscribe((departments) => {
        this.departmentOptions = departments.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
  }

  private onClientChange(clientId: string | null): void {
    this.enquiryForm.controls.contact.reset(null);
    this.contactOptions = [];
    if (clientId && this.optionsLoaded) this.loadContacts(clientId);
  }

  private loadContacts(clientId: string): void {
    this.subscriptions.add(
      this.customers$.pipe(take(1)).subscribe((customers) => {
        const customer = customers.find((c) => c._id === clientId);
        this.contactOptions = (customer?.contactDetails || []).map((c: ContactDetail) => ({
          label: `${c.firstName} ${c.lastName}`,
          value: c._id,
        }));
      })
    );
  }

  // --- closing ---------------------------------------------------------------

  /** `discarded` is true when the user confirmed throwing away unsaved changes. */
  onDrawerClosed(discarded: boolean): void {
    if (discarded) this.reset();
    this.closed.emit();
  }

  cancel(): void {
    this.onDrawerClosed(false);
  }

  /** Leaves for the customer form. The draft is saved first so this form comes back filled in. */
  createCustomer(): void {
    if (this.enquiryForm.dirty) this.draft?.save();
    this.closed.emit();
    this.router.navigate(['/customers'], { queryParams: { create: 1 } });
  }

  private reset(): void {
    this.draft?.clear();
    this.contactOptions = [];
    this.enquiryForm.reset({
      client: null,
      contact: null,
      department: null,
      title: '',
      source: null,
      enquiryCategory: null,
      priority: 'Normal',
      requirement: '',
      followUpOutcome: '',
      date: this.todayIso(),
      nextFollowUpDate: this.todayIso(),
      attachments: []
    });
  }

  /** Local calendar date as yyyy-MM-dd (toISOString would shift it by the UTC offset). */
  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- saving ----------------------------------------------------------------

  private buildFormData(): FormData {
    const v = this.enquiryForm.getRawValue();
    const formData = new FormData();
    formData.append('enquiryData', JSON.stringify({
      client: v.client,
      contact: v.contact,
      department: v.department,
      salesPerson: this.salesPersonId,
      title: v.title,
      source: v.source,
      enquiryCategory: v.enquiryCategory,
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

  private isReady(): boolean {
    if (this.enquiryForm.invalid || !this.salesPersonId) {
      this.enquiryForm.markAllAsTouched();
      this.toaster.warning('Check the fields properly!', 'Warning !');
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

  async submit(): Promise<void> {
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
