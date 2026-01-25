import { Component, Inject, OnInit, TemplateRef, ViewChild, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
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
  selectedJob: any = null;
  previousDns: any[] = [];

  dnForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    clientName: ['', [Validators.required]],
    customerLpoNumber: [''],
    dnNo: ['', [Validators.required]],
    dnDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    subject: [''],
    items: this.fb.array([])
  });

  // Inventory Modal Controls
  selectedInventoryItem: any = null;
  inventoryQty: number = 0;

  ngOnInit(): void {
    this.loadJobIds();
    this.generateDnNumber();
    this.loadStockEntries();

    // Watch for Job ID changes
    this.dnForm.get('jobId')?.valueChanges.subscribe(jobId => {
      if (jobId) {
        this.onJobSelect(jobId);
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

    // 1. Get Job Details and Materials
    this.jobService.getOneJob(jobId).subscribe({
      next: (jobData: any) => {
        const job = Array.isArray(jobData) ? jobData[0] : jobData;
        this.selectedJob = job;

        // Populate Header Info
        this.dnForm.patchValue({
          clientName: job.clientDetails?.companyName || job.client?.companyName || '',
          customerLpoNumber: job.purchaseNo || job.lpoNumber || '',
          subject: job.quotation?.subject || ''
        });

        // 2. Get Previous DNs to calculate delivery status
        this.deliveryNoteService.getDnsByJobId(jobId).subscribe({
          next: (dns) => {
            this.previousDns = dns || [];
            this.populateItems(job);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastr.error('Failed to load previous DNs');
            this.populateItems(job); // Still populate even if history fails, assume 0 delivered? 
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

      const group = this.fb.group({
        slNo: [index + 1],
        partNo: [item.partNo || item.itemName || ''], // Quotation might not have partNo field directly in detailed items sometimes, checking interface
        description: [item.detail || item.itemDescription || ''],
        orderedQty: [item.quantity],
        deliveredQty: [prevDelivered],
        currentDeliveryQty: [{ value: 0, disabled: isFulfilled }, [Validators.required, Validators.min(0), Validators.max(remaining)]],
        serialNos: [''], // Text field for comma separated or single
        status: [isFulfilled ? 'Delivered' : 'Pending'],
        itemId: [item._id], // To link back
        isInventoryItem: [false]
      });

      // Update total on change
      group.get('currentDeliveryQty')?.valueChanges.subscribe(val => {
        // Logic to update status dynamically if needed?
        // But status is mostly for display of initial state or final state.
      });

      itemsArray.push(group);
    });
  }

  getDeliveredQty(itemId: string): number {
    // Sum up delivered qtys from previous DNs for this item
    let total = 0;
    this.previousDns.forEach(dn => {
      const matchedItem = dn.items?.find((i: any) => i.itemId === itemId);
      if (matchedItem) {
        total += matchedItem.deliveredQty || 0;
      }
    });
    return total;
  }

  get items(): FormArray {
    return this.dnForm.get('items') as FormArray;
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
        currentDeliveryQty: [this.inventoryQty, [Validators.required, Validators.min(0), Validators.max(this.inventoryQty)]],
        serialNos: [''],
        status: ['Pending'],
        itemId: [stockEntry._id],
        isInventoryItem: [true],
        stockEntryId: [stockEntry._id] // Track stock entry for inventory deduction
      });
      this.items.push(group);
      this.dialog.closeAll();
      this.toastr.success('Stock entry added to delivery note');
    }
  }

  onPreview(): void {
    this.toastr.info('Preview logic not implemented yet');
  }

  onSave(): void {
    if (this.dnForm.invalid) {
      this.dnForm.markAllAsTouched();
      this.toastr.warning('Please fill all required fields correctly');
      return;
    }

    const formValue = this.dnForm.getRawValue(); // Get raw value to include disabled fields
    // Filter out items with 0 delivery ? "users can deliver only part...". 
    // Usually invalid to deliver 0 unless it's just skipping? 
    // But we should probably send all items with their status.

    // Construct payload
    const payload = {
      ...formValue,
      items: formValue.items.map((item: any) => ({
        ...item,
        // Ensure we send serial numbers as array if needed, or string
        serialNos: item.serialNos ? item.serialNos.split(',').map((s: string) => s.trim()) : []
      }))
    };

    // Validations
    const hasDelivery = payload.items.some((i: any) => i.currentDeliveryQty > 0);
    if (!hasDelivery) {
      this.toastr.warning('Please deliver at least one item');
      return;
    }

    this.isSubmitting.set(true);
    this.deliveryNoteService.createDn(payload).subscribe({
      next: () => {
        this.toastr.success('DN Generated Successfully');
        this.router.navigate(['/dispatch/delivery-note-register']);
      },
      error: (err) => {
        this.toastr.error(err.error?.message || 'Failed to create DN');
        this.isSubmitting.set(false);
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/dispatch/delivery-note-register']);
  }

  close() {
    this.dialog.closeAll();
  }
}
