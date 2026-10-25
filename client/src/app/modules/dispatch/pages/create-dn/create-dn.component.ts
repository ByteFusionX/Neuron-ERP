import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DnItemEntryComponent } from '../../components/dn-item-entry/dn-item-entry.component';

@Component({
  selector: 'app-create-dn',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ButtonComponent,
    IconsModule,
    MatDialogModule,
    SmartFormModule,
    ActionButtonComponent,
    DnItemEntryComponent,
    NgIcon
  ],
  templateUrl: './create-dn.component.html',
  styleUrl: './create-dn.component.css'
})
export class CreateDnComponent implements OnInit, OnChanges {
  @Input() open = true;
  @Input() drawerMode = false;
  @Input() editId: string | null = null;
  @Input() defaultJobId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private deliveryNoteService = inject(DeliveryNoteService);
  private jobService = inject(JobService);
  private employeeService = inject(EmployeeService);

  jobIds: any[] = [];
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  draftLoaded = signal<boolean>(false);
  loadedDraftNo = signal<string | null>(null);
  selectedJob: any = null;
  previousDns: any[] = [];
  isEditMode: boolean = false;
  draftDnId: string | null = null;
  deliveryTypeOptions: SfOption[] = [
    { label: 'Customer Delivery', value: 'Customer Delivery' },
    { label: 'Project Site', value: 'Project Site' },
    { label: 'Customer Pickup', value: 'Customer Pickup' },
    { label: 'Drop Ship', value: 'Drop Ship' },
    { label: 'Replacement', value: 'Replacement' }
  ];

  get jobOptions(): SfOption[] {
    return this.jobIds.map((job: any) => ({ label: job.jobId, value: job._id }));
  }

  dnForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    clientName: ['', [Validators.required]],
    customerLpoNumber: ['', [Validators.required]],
    dnNo: ['', [Validators.required]],
    dnDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    subject: [''],
    deliveryType: ['Customer Delivery', [Validators.required]],
    shipToName: [''],
    shipToAddress: [''],
    contactPerson: [''],
    contactNo: [''],
    deliveryInstructions: [''],
    items: this.fb.array([])
  });

  step: 1 | 2 = 1;
  /** True after a failed attempt to leave step 1; reset once the step changes. */
  stepAttempted = false;
  readonly steps = [
    { n: 1 as const, label: 'Delivery details' },
    { n: 2 as const, label: 'Items' },
  ];
  private readonly detailControls = ['jobId', 'clientName', 'customerLpoNumber', 'dnNo', 'dnDate', 'subject', 'deliveryType',
    'shipToName', 'shipToAddress', 'contactPerson', 'contactNo', 'deliveryInstructions'];

  selectedItems: Set<number> = new Set();

  ngOnInit(): void {
    this.employeeService.employeeData$.subscribe(emp => {
      if (emp && emp.category && emp.category.privileges) {
        if (!emp.category.privileges.dispatch?.createDeliveryNote) {
          this.toastr.error('You do not have permission to create or edit Delivery Notes');
          this.router.navigate(['/dispatch']);
          return;
        }
      }
    });

    this.loadJobIds();

    const editId = this.editId || this.route.snapshot.queryParams['id'];
    if (editId) {
      this.loadDraftForEdit(editId);
    } else {
      this.generateDnNumber();
    }

    // Watch for Job ID changes
    this.dnForm.get('jobId')?.valueChanges.subscribe(jobId => {
      if (jobId && !this.isEditMode) {
        this.onJobSelect(jobId);
      }
    });

    // Reset isSubmitting when form becomes valid
    this.dnForm.statusChanges.subscribe(status => {
      if (status === 'VALID' && this.isSubmitting()) {
        this.isSubmitting.set(false);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.drawerMode || !changes['open'] || !this.open) return;
    this.resetFormState();
    if (this.editId) {
      this.loadDraftForEdit(this.editId);
    } else {
      this.generateDnNumber();
      if (this.defaultJobId) this.dnForm.patchValue({ jobId: this.defaultJobId });
    }
  }

  isDetailsValid(): boolean {
    return this.detailControls.every((name) => !this.dnForm.get(name)?.invalid);
  }

  goToStep(step: 1 | 2): void {
    if (step === 2 && !this.isDetailsValid()) {
      this.detailControls.forEach((name) => this.dnForm.get(name)?.markAsTouched());
      this.stepAttempted = true;
      return;
    }
    this.step = step;
    this.stepAttempted = false;
  }

  private resetFormState(): void {
    this.step = 1;
    this.stepAttempted = false;
    this.isEditMode = false;
    this.draftDnId = null;
    this.selectedJob = null;
    this.previousDns = [];
    this.selectedItems.clear();
    this.clearDraftLoaded();
    this.items.clear();
    this.dnForm.reset({
      jobId: '',
      clientName: '',
      customerLpoNumber: '',
      dnNo: '',
      dnDate: new Date().toISOString().split('T')[0],
      subject: '',
      deliveryType: 'Customer Delivery',
      shipToName: '',
      shipToAddress: '',
      contactPerson: '',
      contactNo: '',
      deliveryInstructions: ''
    });
  }

  loadDraftForEdit(dnId: string): void {
    this.isLoading.set(true);
    this.deliveryNoteService.getDnById(dnId).subscribe({
      next: (dn) => {
        if (dn.status !== 'Draft') {
          this.toastr.error('Only draft DNs can be edited');
          this.router.navigate(['/dispatch']);
          this.isLoading.set(false);
          return;
        }
        this.isEditMode = true;
        this.draftDnId = dn._id;
        this.setDraftLoaded(dn);
        this.loadDraftData(dn);
        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load draft DN');
        this.router.navigate(['/dispatch']);
        this.isLoading.set(false);
      }
    });
  }

  setDraftLoaded(dn: any): void {
    this.draftLoaded.set(true);
    this.loadedDraftNo.set(dn?.dnNo || null);
    if (dn?.dnNo) {
      this.toastr.info(`Draft loaded - ${dn.dnNo}`);
    } else {
      this.toastr.info('Draft loaded');
    }
  }

  clearDraftLoaded(): void {
    this.draftLoaded.set(false);
    this.loadedDraftNo.set(null);
  }

  loadDraftData(dn: any): void {
    this.dnForm.patchValue({
      jobId: dn.jobId?._id || dn.jobId,
      clientName: dn.clientName,
      customerLpoNumber: dn.customerLpoNumber,
      dnNo: dn.dnNo,
      dnDate: dn.dnDate ? new Date(dn.dnDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      subject: dn.subject || '',
      deliveryType: dn.deliveryType || 'Customer Delivery',
      shipToName: dn.shipToName || dn.clientName || '',
      shipToAddress: dn.shipToAddress || '',
      contactPerson: dn.contactPerson || '',
      contactNo: dn.contactNo || '',
      deliveryInstructions: dn.deliveryInstructions || ''
    });

    if (dn.jobId) {
      const jobId = dn.jobId._id || dn.jobId;
      this.jobService.getOneJob(jobId).subscribe({
        next: (jobData: any) => {
          const job = Array.isArray(jobData) ? jobData[0] : jobData;
          this.selectedJob = job;
          this.deliveryNoteService.getDnsByJobId(jobId).subscribe({
            next: (dns) => {
              this.previousDns = (dns || []).filter((d: any) => d._id !== dn._id);
              this.populateItemsFromDraft(dn, job);
            },
            error: () => {
              this.previousDns = [];
              this.populateItemsFromDraft(dn, job);
            }
          });
        }
      });
    }
  }

  populateItemsFromDraft(dn: any, job: any): void {
    const itemsArray = this.items;
    itemsArray.clear();
    this.selectedItems.clear();

    const jobId = job._id || dn.jobId?._id || dn.jobId;

    this.deliveryNoteService.getDnItemsForJob(jobId).subscribe({
      next: (response: any) => {
        const allItems = response?.data || [];

    allItems.forEach((item: any, index: number) => {
      const prevDelivered = this.getDeliveredQty(item._id);
          const remaining = Math.max(0, (item.orderedQty || 0) - prevDelivered);
          const isFulfilled = remaining === 0 && (item.orderedQty || 0) > 0;
          const isAvailable = item.isAvailable === true;

          let initialStatus = isAvailable ? 'Pending' : 'No PO / Not in Inventory';
      if (isFulfilled) {
        initialStatus = 'Delivered';
      } else if (prevDelivered > 0) {
        initialStatus = 'Partially Delivered';
      }

      const draftItem = dn.items?.find((di: any) => di.itemId === item._id);
      const currentDeliveryQty = draftItem?.currentDeliveryQty || 0;
      const serialNos = draftItem ? (draftItem.serialNos || []) : (item.receivedSerialNos || []);

      const group = this.fb.group({
        slNo: [index + 1],
            partNo: [item.partNo?.partNo || item.partNo || ''],
            description: [item.detail || ''],
            totalQuantity: [item.totalQuantity || 0],
            orderedQty: [item.orderedQty || 0],
        deliveredQty: [prevDelivered],
            currentDeliveryQty: [{ value: currentDeliveryQty, disabled: !isAvailable || isFulfilled }, [Validators.min(0), Validators.max(remaining)]],
            serialNos: [this.formatSerialNos(serialNos)],
            status: [initialStatus],
            unavailableReason: [item.unavailableReason || ''],
            itemId: [item._id],
            unitSellingPrice: [item.unitSellingPrice || 0],
            isInventoryItem: [draftItem?.isInventoryItem ?? isAvailable]
      });

      itemsArray.push(group);

          if (currentDeliveryQty > 0 && isAvailable) {
        this.selectedItems.add(index);
        const currentDeliveryControl = group.get('currentDeliveryQty');
        currentDeliveryControl?.enable();
        const balance = this.getBalanceQty(group);
        currentDeliveryControl?.setValidators([Validators.required, Validators.min(1), Validators.max(balance)]);
        currentDeliveryControl?.updateValueAndValidity();
      }

        });
      },
      error: () => {
        this.toastr.error('Failed to load items for job');
      }
    });
  }

  loadJobIds(): void {
    this.jobService.getJobIdsWithApprovedPR().subscribe({
      next: (response: any) => {
        const jobs = Array.isArray(response) ? response : response.jobs || [];
        this.filterJobsWithPendingItems(jobs);
      },
      error: () => this.toastr.error('Failed to load Job IDs')
    });
  }

  // Jobs whose entire item list is already delivered shouldn't show up in the
  // dropdown - only jobs with at least one item still pending delivery.
  private filterJobsWithPendingItems(jobs: any[]): void {
    if (!jobs.length) {
      this.jobIds = [];
      return;
    }

    const checks = jobs.map(job => {
      const jobId = job._id;
      return forkJoin({
        items: this.deliveryNoteService.getDnItemsForJob(jobId).pipe(catchError(() => of({ data: [] }))),
        dns: this.deliveryNoteService.getDnsByJobId(jobId).pipe(catchError(() => of([])))
      }).pipe(
        map(({ items, dns }) => {
          const allItems = items?.data || [];
          const previousDns = (dns || []).filter((d: any) => d.status !== 'Cancelled' && d.status !== 'Draft');

          const hasPending = allItems.some((item: any) => {
            const delivered = previousDns.reduce((total: number, dn: any) => {
              const matchedItem = dn.items?.find((i: any) => i.itemId === item._id);
              return total + (matchedItem?.currentDeliveryQty || 0);
            }, 0);
            const remaining = (item.orderedQty || 0) - delivered;
            return remaining > 0;
          });

          return { job, hasPending };
        })
      );
    });

    forkJoin(checks).subscribe({
      next: (results) => {
        this.jobIds = results.filter(r => r.hasPending).map(r => r.job);
      },
      error: () => {
        this.toastr.error('Failed to load Job IDs');
        this.jobIds = jobs;
      }
    });
  }

  generateDnNumber(): void {
    this.deliveryNoteService.generateDnNumber().subscribe({
      next: (res) => this.dnForm.patchValue({ dnNo: res.dnNumber }),
      error: () => this.toastr.error('Failed to generate DN Number')
    });
  }

  onJobSelect(jobId: string): void {
    this.isLoading.set(true);
    this.isEditMode = false;
    this.draftDnId = null;
    this.clearDraftLoaded();

    this.loadJobData(jobId);
  }

  loadJobData(jobId: string): void {
    this.jobService.getOneJob(jobId).subscribe({
      next: (jobData: any) => {
        const job = Array.isArray(jobData) ? jobData[0] : jobData;
        this.selectedJob = job;

        this.dnForm.patchValue({
          clientName: job.clientDetails?.companyName || job.client?.companyName || '',
          customerLpoNumber: job.purchaseNo || job.lpoNumber || '',
          subject: job.quotation?.subject || '',
          shipToName: job.clientDetails?.companyName || job.client?.companyName || '',
          shipToAddress: job.projectName || job.quotation?.deliveryLocation || job.clientDetails?.companyAddress || '',
          // the quotation's attention contact is who receives the goods unless the user says otherwise
          contactPerson: [job.attention?.firstName, job.attention?.lastName].map((n: string) => n?.trim()).filter(Boolean).join(' '),
          contactNo: job.attention?.phoneNo ? String(job.attention.phoneNo) : '',
        });

        if (!this.dnForm.get('dnNo')?.value) {
          this.generateDnNumber();
        }

        this.deliveryNoteService.getDnsByJobId(jobId).subscribe({
          next: (dns) => {
            this.previousDns = dns || [];
            this.populateItems(jobId);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastr.error('Failed to load previous DNs');
            this.previousDns = [];
            this.populateItems(jobId);
            this.isLoading.set(false);
          }
        });
      },
      error: () => {
        this.toastr.error('Failed to load Job details');
        this.isLoading.set(false);
      }
    });
  }

  populateItems(jobId: string): void {
    const itemsArray = this.items;
    itemsArray.clear();
    this.selectedItems.clear();

    this.deliveryNoteService.getDnItemsForJob(jobId).subscribe({
      next: (response: any) => {
        const allItems = response?.data || [];

    allItems.forEach((item: any, index: number) => {
      const prevDelivered = this.getDeliveredQty(item._id);
          const remaining = Math.max(0, (item.orderedQty || 0) - prevDelivered);
          const isFulfilled = remaining === 0 && (item.orderedQty || 0) > 0;
          const isAvailable = item.isAvailable === true;

          let initialStatus = isAvailable ? 'Pending' : 'No PO / Not in Inventory';
      if (isFulfilled) {
        initialStatus = 'Delivered';
      } else if (prevDelivered > 0) {
        initialStatus = 'Partially Delivered';
      }

      const group = this.fb.group({
        slNo: [index + 1],
            partNo: [item.partNo?.partNo || item.partNo || ''],
            description: [item.detail || ''],
            totalQuantity: [item.totalQuantity || 0],
            orderedQty: [item.orderedQty || 0],
        deliveredQty: [prevDelivered],
            currentDeliveryQty: [{ value: 0, disabled: !isAvailable || isFulfilled }, [Validators.min(0), Validators.max(remaining)]],
            serialNos: [this.formatSerialNos(item.receivedSerialNos || [])],
            status: [initialStatus],
            unavailableReason: [item.unavailableReason || ''],
            itemId: [item._id],
            unitSellingPrice: [item.unitSellingPrice || 0],
            isInventoryItem: [isAvailable]
      });

      itemsArray.push(group);
        });
      },
      error: () => {
        this.toastr.error('Failed to load items for job');
      }
    });
  }

  getDeliveredQty(itemId: string): number {
    let total = 0;
    this.previousDns.forEach(dn => {
      if (dn.status === 'Cancelled' || dn.status === 'Draft') return;
      const matchedItem = dn.items?.find((i: any) => i.itemId === itemId);
      if (matchedItem) {
        total += matchedItem.currentDeliveryQty || 0;
      }
    });
    return total;
  }

  get items(): FormArray {
    return this.dnForm.get('items') as FormArray;
  }

  getBalanceQty(itemControl: AbstractControl): number {
    const orderedQty = itemControl.get('orderedQty')?.value || 0;
    const deliveredQty = itemControl.get('deliveredQty')?.value || 0;
    const balance = orderedQty - deliveredQty;
    return balance > 0 ? balance : 0;
  }

  readonly isSelectedFn = (index: number) => this.isItemSelected(index);

  private parseSerialNos(value: unknown): string[] {
    const serials = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
    return [...new Set(serials.map(serial => String(serial).trim()).filter(Boolean))];
  }

  private formatSerialNos(value: unknown): string {
    return this.parseSerialNos(value).join('\n');
  }

  isItemSelected(index: number): boolean {
    return this.selectedItems.has(index);
  }

  toggleItemSelection(index: number): void {
    const itemControl = this.items.at(index);
    const status = itemControl?.get('status')?.value;
    
    if (status === 'Delivered' || status === 'No PO / Not in Inventory') {
      return;
    }

    const currentDeliveryControl = itemControl?.get('currentDeliveryQty');

    if (this.selectedItems.has(index)) {
      this.selectedItems.delete(index);
      currentDeliveryControl?.disable();
      currentDeliveryControl?.clearValidators();
      currentDeliveryControl?.setValue(0, { emitEvent: false });
      currentDeliveryControl?.updateValueAndValidity();
    } else {
      this.selectedItems.add(index);
      const balance = this.getBalanceQty(itemControl!);
      const existingValue = currentDeliveryControl?.value;
      currentDeliveryControl?.enable();
      if (!existingValue || existingValue <= 0) {
        currentDeliveryControl?.setValue(balance, { emitEvent: false });
      }
      currentDeliveryControl?.setValidators([Validators.required, Validators.min(1), Validators.max(balance)]);
      currentDeliveryControl?.updateValueAndValidity();
    }
  }

  isAllDelivered(): boolean {
    if (this.items.length === 0) return false;
    return this.items.controls.every(item => item.get('status')?.value === 'Delivered');
  }

  hasSelectedItems(): boolean {
    return this.selectedItems.size > 0;
  }

  async onPreview(): Promise<void> {
    if (this.dnForm.invalid) {
      this.dnForm.markAllAsTouched();
      this.isSubmitting.set(true);
      setTimeout(() => {
        if (this.dnForm.invalid) {
          this.isSubmitting.set(false);
        }
      }, 100);
      if (!this.isDetailsValid()) this.step = 1;
      this.toastr.warning('Please fill all required fields correctly');
      return;
    }

    if (!this.hasSelectedItems()) {
      this.toastr.warning('Please select at least one item to preview');
      return;
    }

    const formValue = this.dnForm.getRawValue();
    const selectedIndices = Array.from(this.selectedItems);

    const selectedItemsData = selectedIndices.map(index => {
      const item = formValue.items[index];
      const itemControl = this.items.at(index);

      if (!itemControl) {
        return null;
      }

      const currentDeliveryQty = itemControl.get('currentDeliveryQty')?.value || 0;

      if (currentDeliveryQty <= 0) {
        return null;
      }

      return {
        ...item,
        currentDeliveryQty: currentDeliveryQty,
        serialNos: this.parseSerialNos(item.serialNos)
      };
    }).filter(item => item !== null);

    if (selectedItemsData.length === 0) {
      this.toastr.warning('Please enter delivery quantity for selected items');
      return;
    }

    const previewData = {
      ...formValue,
      items: selectedItemsData,
      jobId: this.selectedJob ? { jobId: this.selectedJob.jobId } : { jobId: formValue.jobId || '' },
      paymentTerms: this.selectedJob?.quotation?.paymentTerms ?? ''
    };

    try {
      const pdfDoc = await this.deliveryNoteService.generatePDF(previewData, true);
      pdfDoc.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.dialog.open(PdfPreviewComponent, {
          height: '90vh',
          maxWidth: '1200px',
          data: {
            url: url,
            formatedQuote: previewData,
            type: 'delivery-note'
          }
        });
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.toastr.error('Failed to generate PDF preview');
    }
  }

  onPostDn(): void {
    if (this.dnForm.invalid) {
      this.dnForm.markAllAsTouched();
      this.isSubmitting.set(true);
      setTimeout(() => {
        if (this.dnForm.invalid) {
          this.isSubmitting.set(false);
        }
      }, 100);
      if (!this.isDetailsValid()) this.step = 1;
      this.toastr.warning('Please fill all required fields correctly');
      return;
    }

    if (this.isAllDelivered()) {
      this.toastr.warning('All items are already delivered');
      return;
    }

    if (!this.hasSelectedItems()) {
      this.toastr.warning('Please select at least one item to deliver');
      return;
    }

    const formValue = this.dnForm.getRawValue();
    const selectedIndices = Array.from(this.selectedItems);

    const selectedItemsData = selectedIndices.map(index => {
      const item = formValue.items[index];
      const itemControl = this.items.at(index);

      if (!itemControl) {
        return null;
      }

      const currentDeliveryQty = itemControl.get('currentDeliveryQty')?.value || 0;

      if (currentDeliveryQty <= 0) {
        itemControl.get('currentDeliveryQty')?.markAsTouched();
        return null;
      }

      return {
        ...item,
        currentDeliveryQty: currentDeliveryQty,
        serialNos: this.parseSerialNos(item.serialNos)
      };
    }).filter(item => item !== null);

    if (selectedItemsData.length === 0) {
      this.toastr.warning('Please enter delivery quantity for selected items');
      return;
    }

    const invalidItems = selectedIndices.filter(index => {
      const itemControl = this.items.at(index);
      return itemControl?.get('currentDeliveryQty')?.invalid;
    });

    if (invalidItems.length > 0) {
      invalidItems.forEach(index => {
        this.items.at(index)?.get('currentDeliveryQty')?.markAsTouched();
      });
      this.toastr.warning('Please fix validation errors for selected items');
      return;
    }

    const payload = {
      ...formValue,
      items: selectedItemsData,
      status: 'Ready for Dispatch'
    };

    console.log('DN Payload:', JSON.stringify(payload, null, 2));

    this.isSubmitting.set(true);

    // Marking ready also sends the DN out, so it lands in Out for Delivery; delivery is confirmed from there.
    const save$ = this.isEditMode && this.draftDnId
      ? this.deliveryNoteService.updateDn(this.draftDnId, payload).pipe(map(res => res?.data?._id || res?._id || this.draftDnId))
      : this.deliveryNoteService.createDn(payload).pipe(map(res => res?.data?._id || res?._id));

    save$.pipe(switchMap(id => this.deliveryNoteService.dispatchDn(id))).subscribe({
      next: () => {
        this.toastr.success('DN is out for delivery');
        this.afterSaved();
      },
      error: (err) => {
        this.toastr.error(err.error?.message || 'Failed to mark DN ready');
        this.isSubmitting.set(false);
        // The DN may already be saved as ready; refresh so it still shows up in the list.
        this.saved.emit();
      }
    });
  }

  onCancel(): void {
    if (this.drawerMode) {
      this.closed.emit();
      return;
    }
    this.router.navigate(['/dispatch']);
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  private afterSaved(): void {
    this.saved.emit();
    if (this.drawerMode) {
      this.closed.emit();
      return;
    }
    this.router.navigate(['/dispatch']);
  }

  close() {
    this.dialog.closeAll();
  }
}
