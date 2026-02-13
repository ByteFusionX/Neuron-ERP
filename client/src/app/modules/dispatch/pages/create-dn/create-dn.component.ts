import { Component, Inject, OnInit, TemplateRef, ViewChild, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { StockEntryService, StockEntry } from 'src/app/core/services/stock-entry/stock-entry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { NgIconComponent } from '@ng-icons/core';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';

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
    NgIconComponent
  ],
  templateUrl: './create-dn.component.html',
  styleUrl: './create-dn.component.css'
})
export class CreateDnComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private deliveryNoteService = inject(DeliveryNoteService);
  private jobService = inject(JobService);
  private stockEntryService = inject(StockEntryService);
  private employeeService = inject(EmployeeService);

  @ViewChild('inventoryModal') inventoryModal!: TemplateRef<any>;

  jobIds: any[] = [];
  stockEntries: StockEntry[] = [];
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isSavingDraft = signal<boolean>(false);
  draftLoaded = signal<boolean>(false);
  loadedDraftNo = signal<string | null>(null);
  selectedJob: any = null;
  previousDns: any[] = [];
  isEditMode: boolean = false;
  draftDnId: string | null = null;

  dnForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    clientName: ['', [Validators.required]],
    customerLpoNumber: ['', [Validators.required]],
    dnNo: ['', [Validators.required]],
    dnDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    subject: [''],
    items: this.fb.array([])
  });

  selectedInventoryItem: any = null;
  inventoryQty: number = 0;

  serialNoInputs: Map<number, string> = new Map();
  itemSerialNos: Map<number, string[]> = new Map();
  selectedItems: Set<number> = new Set();

  ngOnInit(): void {
    this.loadJobIds();
    this.loadStockEntries();

    const editId = this.route.snapshot.queryParams['id'];
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

  loadDraftForEdit(dnId: string): void {
    this.isLoading.set(true);
    this.deliveryNoteService.getDnById(dnId).subscribe({
      next: (dn) => {
        this.isEditMode = true;
        this.draftDnId = dn._id;
        this.setDraftLoaded(dn);
        this.loadDraftData(dn);
        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load draft DN');
        this.router.navigate(['/dispatch/delivery-note-register']);
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
      subject: dn.subject || ''
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
    this.itemSerialNos.clear();
    this.serialNoInputs.clear();

    const quoteItems = job.quotation?.optionalItems?.flatMap((opt: any) => opt.items) || [];
    let allItems: any[] = [];
    if (job.quotation?.optionalItems) {
      job.quotation.optionalItems.forEach((opt: any) => {
        if (opt.items) {
          opt.items.forEach((item: any) => {
            if (item.itemDetails) {
              allItems.push(...item.itemDetails.map((detail: any) => ({
                ...detail,
                itemName: item.itemName
              })));
            }
          });
        }
      });
    }

    allItems.forEach((item: any, index: number) => {
      const prevDelivered = this.getDeliveredQty(item._id);
      const remaining = Math.max(0, item.quantity - prevDelivered);
      const isFulfilled = remaining === 0;

      let initialStatus = 'Pending';
      if (isFulfilled) {
        initialStatus = 'Delivered';
      } else if (prevDelivered > 0) {
        initialStatus = 'Partially Delivered';
      }

      const draftItem = dn.items?.find((di: any) => di.itemId === item._id);
      const currentDeliveryQty = draftItem?.currentDeliveryQty || 0;
      const serialNos = draftItem?.serialNos || [];

      const group = this.fb.group({
        slNo: [index + 1],
        partNo: [item.partNo || item.itemName || ''],
        description: [item.detail || item.itemDescription || ''],
        orderedQty: [item.quantity],
        deliveredQty: [prevDelivered],
        currentDeliveryQty: [{ value: currentDeliveryQty, disabled: true }, [Validators.min(0), Validators.max(remaining)]],
        serialNos: [''],
        status: [initialStatus],
        itemId: [item._id],
        isInventoryItem: [draftItem?.isInventoryItem || false]
      });

      itemsArray.push(group);

      if (currentDeliveryQty > 0) {
        this.selectedItems.add(index);
        const currentDeliveryControl = group.get('currentDeliveryQty');
        currentDeliveryControl?.enable();
        const balance = this.getBalanceQty(group);
        currentDeliveryControl?.setValidators([Validators.required, Validators.min(1), Validators.max(balance)]);
        currentDeliveryControl?.updateValueAndValidity();
      }

      if (serialNos.length > 0) {
        this.itemSerialNos.set(index, Array.isArray(serialNos) ? serialNos : [serialNos]);
      }
    });
  }

  loadJobIds(): void {
    this.jobService.getJobids().subscribe({
      next: (response: any) => {
        this.jobIds = Array.isArray(response) ? response : response.jobs || [];
      },
      error: () => this.toastr.error('Failed to load Job IDs')
    });
  }

  loadStockEntries(): void {
    this.stockEntryService.getStockEntries({ page: 1, row: 1000 }).subscribe({
      next: (response) => {
        this.stockEntries = response.data?.stockEntries?.map(entry => ({
          ...entry,
          displayLabel: `${entry.partNo.partNo} - ${entry.partNo.productDescription} (Available: ${entry.quantity})`
        })) || [];
      },
      error: () => this.toastr.error('Failed to load stock entries')
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

    // Check for existing draft
    this.deliveryNoteService.getDraftDnByJobId(jobId).subscribe({
      next: (draftDn) => {
        if (draftDn) {
          this.isEditMode = true;
          this.draftDnId = draftDn._id;
          this.setDraftLoaded(draftDn);
          this.loadDraftData(draftDn);
          this.isLoading.set(false);
        } else {
          this.loadJobData(jobId);
        }
      },
      error: () => {
        this.loadJobData(jobId);
      }
    });
  }

  loadJobData(jobId: string): void {
    this.jobService.getOneJob(jobId).subscribe({
      next: (jobData: any) => {
        const job = Array.isArray(jobData) ? jobData[0] : jobData;
        this.selectedJob = job;

        this.dnForm.patchValue({
          clientName: job.clientDetails?.companyName || job.client?.companyName || '',
          customerLpoNumber: job.purchaseNo || job.lpoNumber || '',
          subject: job.quotation?.subject || ''
        });

        if (!this.dnForm.get('dnNo')?.value) {
          this.generateDnNumber();
        }

        this.deliveryNoteService.getDnsByJobId(jobId).subscribe({
          next: (dns) => {
            this.previousDns = dns || [];
            this.populateItems(job);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastr.error('Failed to load previous DNs');
            this.previousDns = [];
            this.populateItems(job);
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

  populateItems(job: any): void {
    const itemsArray = this.items;
    itemsArray.clear();
    this.selectedItems.clear();
    this.itemSerialNos.clear();
    this.serialNoInputs.clear();

    const quoteItems = job.quotation?.optionalItems?.flatMap((opt: any) => opt.items) || [];

    // Flatten nested items from quotation structure
    // Structure: OptionalItems -> items -> itemDetails? 
    // Checking quotation interface: OptionalItems -> items(QuoteItem[]) -> itemDetails(QuoteItemDetail[])

    let allItems: any[] = [];
    if (job.quotation?.optionalItems) {
      job.quotation.optionalItems.forEach((opt: any) => {
        if (opt.items) {
          opt.items.forEach((item: any) => {
            if (item.itemDetails) {
              allItems.push(...item.itemDetails.map((detail: any) => ({
                ...detail,
                itemName: item.itemName // Carry over parent name if needed
              })));
            }
          });
        }
      });
    }

    allItems.forEach((item: any, index: number) => {
      // Calculate already delivered qty
      const prevDelivered = this.getDeliveredQty(item._id);
      const remaining = Math.max(0, item.quantity - prevDelivered);

      const isFulfilled = remaining === 0;

      let initialStatus = 'Pending';
      if (isFulfilled) {
        initialStatus = 'Delivered';
      } else if (prevDelivered > 0) {
        initialStatus = 'Partially Delivered';
      }

      const group = this.fb.group({
        slNo: [index + 1],
        partNo: [item.partNo || item.itemName || ''],
        description: [item.detail || item.itemDescription || ''],
        orderedQty: [item.quantity],
        deliveredQty: [prevDelivered],
        currentDeliveryQty: [{ value: 0, disabled: true }, [Validators.min(0), Validators.max(remaining)]],
        serialNos: [''],
        status: [initialStatus],
        itemId: [item._id],
        isInventoryItem: [false]
      });

      itemsArray.push(group);
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

  getSerialNos(index: number): string[] {
    return this.itemSerialNos.get(index) || [];
  }

  getSerialNoInput(index: number): string {
    return this.serialNoInputs.get(index) || '';
  }

  setSerialNoInput(index: number, value: string): void {
    this.serialNoInputs.set(index, value);
  }

  addSerialNo(index: number): void {
    const input = this.serialNoInputs.get(index)?.trim();
    if (!input) return;

    const currentList = this.itemSerialNos.get(index) || [];
    if (currentList.includes(input)) {
      this.toastr.warning('Serial number already added');
      return;
    }
    currentList.push(input);
    this.itemSerialNos.set(index, currentList);
    this.serialNoInputs.set(index, '');
  }

  removeSerialNo(index: number, serialNo: string): void {
    const currentList = this.itemSerialNos.get(index) || [];
    const filtered = currentList.filter(s => s !== serialNo);
    this.itemSerialNos.set(index, filtered);
  }

  onSerialNoKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addSerialNo(index);
    }
  }

  isItemSelected(index: number): boolean {
    return this.selectedItems.has(index);
  }

  toggleItemSelection(index: number): void {
    const itemControl = this.items.at(index);
    const status = itemControl?.get('status')?.value;
    
    if (status === 'Delivered') {
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
      currentDeliveryControl?.enable();
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

  // Inventory Modal Logic
  openInventoryModal(): void {
    this.selectedInventoryItem = null;
    this.inventoryQty = 0;
    this.dialog.open(this.inventoryModal, { width: '500px' });
  }

  addInventoryItem(): void {
    if (!this.selectedInventoryItem || this.inventoryQty <= 0) {
      this.toastr.warning('Please select an item and quantity');
      return;
    }

    const stockEntry = this.stockEntries.find(entry => entry._id === this.selectedInventoryItem);
    if (stockEntry) {
      // Check available quantity
      const availableQty = stockEntry.availableQuantity || stockEntry.quantity;
      if (this.inventoryQty > availableQty) {
        this.toastr.warning(`Only ${availableQty} units available in stock`);
        return;
      }

      const group = this.fb.group({
        slNo: [this.items.length + 1],
        partNo: [stockEntry.partNo],
        description: [stockEntry.productDescription],
        orderedQty: [this.inventoryQty],
        deliveredQty: [0],
        currentDeliveryQty: [{ value: 0, disabled: true }, [Validators.min(0), Validators.max(this.inventoryQty)]],
        serialNos: [''],
        status: ['Pending'],
        itemId: [stockEntry._id],
        isInventoryItem: [true],
        stockEntryId: [stockEntry._id]
      });
      this.items.push(group);
      this.dialog.closeAll();
      this.toastr.success('Stock entry added to delivery note');
    }
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
        serialNos: this.itemSerialNos.get(index) || []
      };
    }).filter(item => item !== null);

    if (selectedItemsData.length === 0) {
      this.toastr.warning('Please enter delivery quantity for selected items');
      return;
    }

    const previewData = {
      ...formValue,
      items: selectedItemsData
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

  onSaveDraft(): void {
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
        serialNos: this.itemSerialNos.get(index) || []
      };
    }).filter(item => item !== null);

    const payload = {
      ...formValue,
      items: selectedItemsData,
      status: 'Draft'
    };

    this.isSavingDraft.set(true);

    if (this.isEditMode && this.draftDnId) {
      this.deliveryNoteService.updateDn(this.draftDnId, payload).subscribe({
        next: () => {
          this.toastr.success('Draft saved successfully');
          this.isSavingDraft.set(false);
          this.router.navigate(['/dispatch/delivery-note-register']);
        },
        error: (err) => {
          this.toastr.error(err.error?.message || 'Failed to save draft');
          this.isSavingDraft.set(false);
        }
      });
    } else {
      this.deliveryNoteService.createDn(payload).subscribe({
        next: () => {
          this.toastr.success('Draft saved successfully');
          this.isSavingDraft.set(false);
          this.router.navigate(['/dispatch/delivery-note-register']);
        },
        error: (err) => {
          this.toastr.error(err.error?.message || 'Failed to save draft');
          this.isSavingDraft.set(false);
        }
      });
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
        serialNos: this.itemSerialNos.get(index) || []
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
      items: selectedItemsData
    };

    console.log('DN Payload:', JSON.stringify(payload, null, 2));
    console.log('Serial Numbers by Item:', Array.from(this.itemSerialNos.entries()));

    this.isSubmitting.set(true);

    if (this.isEditMode && this.draftDnId) {
      this.deliveryNoteService.updateDn(this.draftDnId, payload).subscribe({
        next: () => {
          this.toastr.success('DN Posted Successfully');
          this.router.navigate(['/dispatch/delivery-note-register']);
        },
        error: (err) => {
          this.toastr.error(err.error?.message || 'Failed to post DN');
          this.isSubmitting.set(false);
        }
      });
    } else {
    this.deliveryNoteService.createDn(payload).subscribe({
      next: () => {
          this.toastr.success('DN Posted Successfully');
        this.router.navigate(['/dispatch/delivery-note-register']);
      },
      error: (err) => {
          this.toastr.error(err.error?.message || 'Failed to post DN');
        this.isSubmitting.set(false);
      }
    });
    }
  }

  onCancel(): void {
    this.router.navigate(['/dispatch/delivery-note-register']);
  }

  close() {
    this.dialog.closeAll();
  }
}
