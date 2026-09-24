import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subscription, filter, shareReplay, switchMap, take } from 'rxjs';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import { Notes } from 'src/app/shared/interfaces/notes.interface';
import { PreviousJobItems } from 'src/app/shared/interfaces/job.interface';
import { QuoteStatus } from 'src/app/shared/interfaces/quotation.interface';
import { SfDraftDirective, SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { PreviousJobsModalComponent } from 'src/app/shared/components/previous-jobs-modal/previous-jobs-modal.component';
import { CatalogueSuggestionSource, CreateProductRequest, ITEM_SUGGESTION_SOURCE, ItemEntryComponent, ItemEntryTotals } from 'src/app/shared/components/item-entry';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';

/** Statuses before the quote has gone to the customer. Mirrors the server, which only revises past these. */
const UNSENT_STATUSES: string[] = [QuoteStatus.Draft, QuoteStatus.WorkInProgress, QuoteStatus.ReadyForSubmission];

/**
 * The three-step quotation form in a slide-over, used to create a quote and to edit one.
 * The host binds `open`, `mode` and (for edit) `quote`, and reacts to `saved` / `closed`.
 * Create mode can also be seeded from an enquiry through `enquiry`.
 */
@Component({
  selector: 'app-quote-form-drawer',
  standalone: true,
  templateUrl: './quote-form-drawer.component.html',
  providers: [DatePipe, CatalogueSuggestionSource, { provide: ITEM_SUGGESTION_SOURCE, useExisting: CatalogueSuggestionSource }],
  imports: [ProductFormDrawerComponent, NgIf, NgFor, NgClass, NgIcon, DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent, ItemEntryComponent],
})
export class QuoteFormDrawerComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() mode: 'create' | 'edit' = 'create';
  /** The quote being edited (populated as the list and view APIs return it). */
  @Input() quote: any | null = null;
  /** Create mode only: the enquiry this quote is being raised from. */
  @Input() enquiry: getEnquiry | null = null;
  /** Fires after the server accepted the create or edit. */
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(ItemEntryComponent) itemEntry?: ItemEntryComponent;
  @ViewChild(SfDraftDirective) draft?: SfDraftDirective;

  saving = false;
  savingDraft = false;
  step: 1 | 2 | 3 = 1;
  readonly steps = [
    { n: 1 as const, label: 'Details', hint: 'Customer and quote details' },
    { n: 2 as const, label: 'Items', hint: 'Line items and pricing' },
    { n: 3 as const, label: 'Notes & Terms', hint: 'What the customer reads' },
  ];
  /** Set when the wizard was opened from an enquiry; kept so the banner and the payload agree. */
  sourceEnquiry: getEnquiry | null = null;
  seedOptionalItems: any[] | null = null;
  itemTotals: ItemEntryTotals = { totalCost: 0, sellingPrice: 0, totalProfit: 0, discount: 0 };
  previousJobItems: PreviousJobItems[] = [];
  private lastFetchedClientId: string | null = null;
  /** True while the form is being patched from an enquiry or a quote, so client-change side effects stand down. */
  private seeding = false;
  private optionsLoaded = false;

  customerOptions: SfOption[] = [];
  contactOptions: SfOption[] = [];
  departmentOptions: SfOption[] = [];
  currencyOptions: SfOption[] = [
    { label: 'QAR', value: 'QAR' },
    { label: 'USD', value: 'USD' },
  ];
  quoteCompanyOptions: SfOption[] = [
    { label: 'Neuron Technologies', value: 'Neuron Technologies' },
    { label: 'Neuron Security System', value: 'Neuron Security System' },
  ];
  customerNoteOptions: SfOption[] = [];
  termsOptions: SfOption[] = [];

  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private toaster = inject(ToastrService);
  private datePipe = inject(DatePipe);
  private quoteService = inject(QuotationService);
  private employeeService = inject(EmployeeService);
  private customerService = inject(CustomerService);
  private profileService = inject(ProfileService);
  private jobService = inject(JobService);
  private customers$!: Observable<getCustomer[]>;
  private subscriptions = new Subscription();

  /** Mirrors the shape the old full-page form posted, so the payload cannot drift. */
  quoteForm = this.fb.group({
    client: [null as string | null, Validators.required],
    attention: [null as string | null, Validators.required],
    date: [this.todayIso(), Validators.required],
    department: [null as string | null],
    departments: [[] as string[], Validators.required],
    subject: ['', Validators.required],
    currency: ['QAR', Validators.required],
    quoteCompany: [null as string | null, Validators.required],
    closingDate: ['', Validators.required],
    optionalItems: this.fb.array([] as any[]),
    customerNote: ['', Validators.required],
    termsAndCondition: ['', Validators.required],
    enqId: [null as string | null],
  });
  /** Step 1 and step 3 own these; step 2 owns `optionalItems`. */
  private readonly stepControls: Record<1 | 2 | 3, string[]> = {
    1: ['client', 'attention', 'departments', 'subject', 'date', 'closingDate', 'currency', 'quoteCompany'],
    2: ['optionalItems'],
    3: ['customerNote', 'termsAndCondition'],
  };

  constructor() {
    this.subscriptions.add(
      this.quoteForm.controls['client'].valueChanges.subscribe((clientId) => {
        this.onClientChange(clientId);
        this.maybeFetchPreviousJobs(clientId);
      })
    );
    this.subscriptions.add(
      this.quoteForm.controls['departments'].valueChanges.subscribe(() => this.onDepartmentsChange())
    );
  }

  get optionalItems(): FormArray {
    return this.quoteForm.get('optionalItems') as FormArray;
  }

  get isEdit(): boolean { return this.mode === 'edit'; }

  get title(): string { return this.isEdit ? 'Edit Quote' : 'Create Quote'; }

  get subtitle(): string {
    const hint = this.steps[this.step - 1].hint;
    if (!this.isEdit || !this.quote) return hint;
    const rev = this.currentRevision;
    return `${this.quote.quoteId}${rev ? ` · Revision ${rev}` : ''} · ${hint}`;
  }

  get currentRevision(): number { return this.quote?.revision ?? 0; }

  /** A quote past the unsent statuses is versioned when its commercial content changes. */
  get revisesOnChange(): boolean {
    return this.isEdit && !!this.quote?.status && !UNSENT_STATUSES.includes(this.quote.status);
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.quoteForm.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open;
    // A different quote or enquiry handed over while open (or on the same tick as opening) re-seeds too.
    if (!this.open || !(opened || changes['quote'] || changes['enquiry'])) return;

    this.ensureOptions();
    this.step = 1;
    if (this.isEdit) {
      if (this.quote) this.seedFromQuote(this.quote);
    } else if (this.enquiry && changes['enquiry']) {
      this.seedFromEnquiry(this.enquiry);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // --- options ---------------------------------------------------------------

  /** Customers, departments and note templates are only fetched once the drawer is first opened. */
  private ensureOptions(): void {
    if (this.optionsLoaded) return;
    this.optionsLoaded = true;

    this.customers$ = this.employeeService.employeeData$.pipe(
      filter((e) => !!e?._id),
      take(1),
      switchMap((e) => this.customerService.getAllCustomers(e!._id as string)),
      shareReplay(1),
    );
    this.subscriptions.add(
      this.customers$.subscribe((customers) => {
        this.customerOptions = customers.map((c) => ({ label: c.companyName, value: c._id }));
        // The quote's contacts can only be listed once the customers are known.
        const clientId = this.quoteForm.controls['client'].value;
        if (clientId) this.loadContacts(clientId);
      })
    );
    this.subscriptions.add(
      this.profileService.getDepartments().subscribe((departments) => {
        this.departmentOptions = departments.map((d) => ({ label: d.departmentName, value: d._id }));
      })
    );
    this.subscriptions.add(
      this.profileService.getNotes().subscribe((res: Notes) => {
        this.customerNoteOptions = res.customerNotes.map((n) => ({ label: n.note, value: n.note }));
        this.termsOptions = res.termsAndConditions.map((n) => ({ label: n.note, value: n.note }));
      })
    );
  }

  /**
   * Refresh the "attention" contact list when the selected client changes. While seeding, the
   * quote's or enquiry's own contact and department win, so this only loads the option list.
   */
  private onClientChange(clientId: string | null): void {
    if (!this.seeding) this.quoteForm.controls['attention'].reset(null);
    this.contactOptions = [];
    if (!clientId || !this.optionsLoaded) return;
    this.loadContacts(clientId);
  }

  private loadContacts(clientId: string): void {
    this.subscriptions.add(
      this.customers$.pipe(take(1)).subscribe((customers) => {
        const customer = customers.find((c) => c._id === clientId);
        if (!customer) return;
        this.contactOptions = (customer.contactDetails || []).map((c: ContactDetail) => ({
          label: `${c.firstName} ${c.lastName}`,
          value: c._id,
        }));
        if (this.seeding) return;
        const departmentId = (customer.department as unknown as getDepartment)?._id ?? (customer.department as unknown as string);
        // Only a hand-picked customer in create mode suggests a department; the enquiry's and the quote's own win.
        if (departmentId && !this.isEdit && !this.sourceEnquiry) this.setDepartments([departmentId]);
      })
    );
  }

  /** `departments` drives the quote id and the list filters; `department` stays the primary one. */
  private setDepartments(ids: (string | null | undefined)[]): void {
    const selected = ids.filter((id): id is string => !!id);
    this.quoteForm.controls['departments'].setValue(selected);
    this.quoteForm.controls['department'].setValue(selected[0] ?? null);
  }

  private onDepartmentsChange(): void {
    const selected = this.quoteForm.controls['departments'].value || [];
    this.quoteForm.controls['department'].setValue(selected[0] ?? null);
  }

  // --- seeding ---------------------------------------------------------------

  private seedFromEnquiry(enquiry: getEnquiry): void {
    this.sourceEnquiry = enquiry;
    this.seeding = true;
    this.quoteForm.patchValue({
      client: (enquiry.client as any)?._id ?? null,
      attention: (enquiry.contact as any)?._id ?? null,
      subject: enquiry.title ?? '',
      currency: enquiry.preSale?.estimations?.currency ?? 'QAR',
      enqId: enquiry._id ?? null,
    });
    this.setDepartments([
      (enquiry.department as unknown as getDepartment)?._id ?? (enquiry.department as unknown as string),
    ]);
    this.seedOptionalItems = enquiry.preSale?.estimations?.optionalItems?.length
      ? enquiry.preSale.estimations.optionalItems
      : null;
    this.quoteForm.markAsDirty();
    this.seeding = false;
  }

  /** Fills the whole form from a saved quote, leaving it pristine so only real edits count as dirty. */
  private seedFromQuote(q: any): void {
    const id = (v: any): string | null => v?._id ?? (typeof v === 'string' ? v : null);
    const text = (v: any): string => (typeof v === 'string' ? v : v?.text ?? '');
    const day = (v: any): string => (v ? this.datePipe.transform(v, 'yyyy-MM-dd') ?? '' : '');
    const departments = (q.departments?.length ? q.departments : [q.department]).map(id).filter((d: string | null): d is string => !!d);

    this.resetWizard();
    this.seeding = true;
    this.quoteForm.patchValue({
      client: id(q.client),
      attention: id(q.attention),
      date: day(q.date),
      closingDate: day(q.closingDate),
      subject: q.subject ?? '',
      currency: q.currency ?? 'QAR',
      quoteCompany: q.quoteCompany ?? null,
      customerNote: text(q.customerNote),
      termsAndCondition: text(q.termsAndCondition),
    });
    this.setDepartments(departments);
    this.seeding = false;
    // A fresh array each time, so item-entry sees the change even when the same quote is reopened.
    this.seedOptionalItems = JSON.parse(JSON.stringify(q.optionalItems ?? []));
    this.quoteForm.markAsPristine();
    this.quoteForm.markAsUntouched();
  }

  private resetWizard(): void {
    this.draft?.clear();
    this.contactOptions = [];
    this.sourceEnquiry = null;
    this.seedOptionalItems = null;
    this.previousJobItems = [];
    this.lastFetchedClientId = null;
    // The items component owns the array's shape, so let it rebuild the blank option.
    this.itemEntry ? this.itemEntry.reset() : this.optionalItems.clear();
    this.quoteForm.reset({
      client: null, attention: null, date: this.todayIso(), department: null, departments: [], subject: '',
      currency: 'QAR', quoteCompany: null, closingDate: '', customerNote: '', termsAndCondition: '', enqId: null,
    });
    this.step = 1;
  }

  /** Local calendar date as yyyy-MM-dd (toISOString would shift it by the UTC offset). */
  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- closing ---------------------------------------------------------------

  /** `discarded` is true when the user confirmed throwing away unsaved changes. */
  onDrawerClosed(discarded: boolean): void {
    // An edit always starts over from the saved quote, so there is nothing worth keeping.
    if (discarded || this.isEdit) this.resetWizard();
    this.closed.emit();
  }

  cancel(): void {
    this.onDrawerClosed(false);
  }

  // --- stepping --------------------------------------------------------------

  /** A step is complete when every control it owns is valid. */
  isStepValid(step: 1 | 2 | 3): boolean {
    return this.stepControls[step].every((name) => this.quoteForm.get(name)?.valid);
  }

  private markStepTouched(step: 1 | 2 | 3): void {
    this.stepControls[step].forEach((name) => this.quoteForm.get(name)?.markAllAsTouched());
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
    if (this.step < 3) this.goToStep((this.step + 1) as 2 | 3);
  }

  previousStep(): void {
    if (this.step > 1) this.step = (this.step - 1) as 1 | 2;
  }

  createProductOpen = false;
  createProductPrefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;

  openCreateProduct({ itemName, detail, scopeIds }: CreateProductRequest): void {
    this.createProductPrefill = { productSegment: scopeIds[0] || '', productCategoryName: itemName, productDescription: detail };
    this.createProductOpen = true;
  }

  onProductCreated(_product: any): void {}

  onItemTotals(totals: ItemEntryTotals): void {
    this.itemTotals = totals;
  }

  /** Fills a note field from the picker, leaving it editable afterwards. */
  applyNoteTemplate(control: 'customerNote' | 'termsAndCondition', note: string | null): void {
    if (!note) return;
    this.quoteForm.controls[control].setValue(note);
    this.quoteForm.controls[control].markAsDirty();
  }

  // --- previous jobs (step 2) --------------------------------------------------

  private maybeFetchPreviousJobs(clientId: string | null): void {
    if (!clientId) {
      this.previousJobItems = [];
      this.lastFetchedClientId = null;
      return;
    }
    if (this.lastFetchedClientId === clientId) return;
    this.lastFetchedClientId = clientId;
    this.subscriptions.add(
      this.jobService.getPreviousJobItemsByClient(clientId).subscribe({
        next: (res: { jobs?: PreviousJobItems[] }) => (this.previousJobItems = res?.jobs || []),
        error: () => (this.previousJobItems = []),
      })
    );
  }

  get previousJobItemsCount(): number {
    return this.previousJobItems.reduce((sum, job) => sum + (job.items?.length || 0), 0);
  }

  openPreviousJobsModal(): void {
    const items = this.previousJobItems.flatMap((job) =>
      (job.items || []).map((item) => ({ jobId: job.jobId, jobStatus: job.status, createdDate: job.createdDate, item }))
    );
    this.dialog
      .open(PreviousJobsModalComponent, { data: { items }, width: '900px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result) => {
        if (result?.items?.length) this.itemEntry?.addItems(result.items);
      });
  }

  // --- saving ----------------------------------------------------------------

  /** One builder for Save as Draft, Create and Edit, so the three can never diverge. `status` is left out on edit. */
  private buildPayload(status?: QuoteStatus, note?: string): any {
    const v = this.quoteForm.getRawValue();
    const payload: any = {
      client: v.client,
      attention: v.attention,
      date: v.date,
      department: v.departments?.[0] ?? null,
      departments: v.departments,
      subject: v.subject,
      currency: v.currency,
      quoteCompany: v.quoteCompany,
      closingDate: v.closingDate,
      customerNote: v.customerNote,
      termsAndCondition: v.termsAndCondition,
      optionalItems: JSON.parse(JSON.stringify(v.optionalItems ?? [])),
    };
    if (status) payload.status = status;

    payload.optionalItems.forEach((option: any) => {
      option.totalDiscount = Number(option.totalDiscount) || 0;
      (option.items || []).forEach((item: any) => {
        (item.itemDetails || []).forEach((detail: any) => {
          // `unitPrice` is a display-only column on the old page; the server rejects it.
          delete detail.unitPrice;
          // An unset supplier must be absent, not '' — the server casts it to an ObjectId.
          if (!detail.supplierId) delete detail.supplierId;
        });
      });
    });

    if (v.enqId) payload.enqId = v.enqId;
    if (note) {
      payload.saveNote = note;
      if (this.isEdit) payload.editReason = note;
    }
    return payload;
  }

  /** Create mode: whatever has been filled in so far is kept as a Draft. */
  saveAsDraft(): void {
    if (!this.isStepValid(1)) {
      this.markStepTouched(1);
      this.step = 1;
      this.toaster.warning('Fill in the customer and quote details first.', 'Incomplete');
      return;
    }

    this.savingDraft = true;
    // Read before resetWizard() clears it.
    const fromEnquiry = !!this.sourceEnquiry;
    this.quoteService.saveQuotation(this.buildPayload(QuoteStatus.Draft)).subscribe({
      next: () => {
        this.savingDraft = false;
        this.finish();
        this.toaster.success(
          fromEnquiry
            ? 'Saved as a draft. The enquiry keeps its current status until the quote is submitted.'
            : 'Quotation saved as a draft.',
          'Saved'
        );
      },
      error: () => (this.savingDraft = false),
    });
  }

  /** Final action: creates as Work In Progress, or saves the edit, each with a required note. */
  submit(): void {
    if (this.quoteForm.invalid) {
      this.quoteForm.markAllAsTouched();
      const firstIncomplete = ([1, 2, 3] as const).find((s) => !this.isStepValid(s));
      if (firstIncomplete) this.step = firstIncomplete;
      return;
    }

    const edit = this.isEdit;
    this.dialog
      .open(ActionConfirmationDialogComponent, {
        data: {
          title: edit ? 'Save changes' : 'Create quotation',
          description: edit
            ? this.revisesOnChange
              ? 'This quotation has already been sent. If the items, notes, terms or currency changed, the current version is kept as a revision. Say what changed.'
              : 'Say what you changed. It is recorded in the quotation history.'
            : this.sourceEnquiry
              ? 'This will create the quotation and mark the source enquiry as Quoted.'
              : 'This will create the quotation. Add a note to record why.',
          icon: 'heroExclamationTriangle',
          iconColor: 'orange',
          confirmButtonText: edit ? 'Save' : 'Create',
          requireComment: true,
          showComment: true,
          commentLabel: edit ? 'What changed' : 'Note',
          commentPlaceholder: edit ? 'Describe the change...' : 'Enter a note about this quotation...',
        },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result?.isConfirmed) return;

        this.saving = true;
        const request$ = edit
          ? this.quoteService.updateQuotation(this.buildPayload(undefined, result.comment), this.quote._id)
          : this.quoteService.saveQuotation(this.buildPayload(QuoteStatus.WorkInProgress, result.comment));
        request$.subscribe({
          next: () => {
            this.saving = false;
            this.finish();
            this.toaster.success(edit ? 'Quotation updated.' : 'Quotation created.', edit ? 'Updated' : 'Created');
          },
          error: () => (this.saving = false),
        });
      });
  }

  /** Clears the form, closes the drawer and tells the host the data changed. */
  private finish(): void {
    this.resetWizard();
    this.closed.emit();
    this.saved.emit();
  }
}
