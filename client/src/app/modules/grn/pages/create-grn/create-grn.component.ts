import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, EventEmitter, HostBinding, inject, Input, OnInit, Output, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { GrnItemEntryComponent } from '../../components/grn-item-entry/grn-item-entry.component';

@Component({
  selector: 'app-create-grn',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IconsModule,
    MatTooltipModule,
    SmartFormModule,
    ActionButtonComponent,
    GrnItemEntryComponent,
  ],
  templateUrl: './create-grn.component.html',
  styleUrl: './create-grn.component.css',
})
export class CreateGrnComponent implements OnInit, AfterViewInit {
  @Input() drawer = false;
  @Input() initialLpoId: string | null = null;
  /** Set to open the drawer on an existing GRN instead of creating one. */
  @Input() grnId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @HostBinding('style.display') get hostDisplay(): string | null {
    return this.drawer ? 'contents' : null;
  }

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private grnService = inject(GrnService);
  private warehouseService = inject(WarehouseService);
  private employeeService = inject(EmployeeService);

  lpoId!: string;
  purchaseId!: string;
  lpo: any = null;
  warehouses: any[] = [];
  employees: any[] = [];
  lpoOptions: any[] = [];
  isLoading = signal<boolean>(true);
  isLpoOptionsLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  formSubmitted = signal<boolean>(false);
  isFormDisabled = signal<boolean>(false);
  isLpoPreselected = signal<boolean>(false);
  existingGRNs: any[] = [];
  deliveryNoteFiles: File[] = [];
  invoiceFiles: File[] = [];
  /** Files already on the GRN being edited; the upload endpoints replace the list, so these are sent back with new ones. */
  existingDeliveryNotes: any[] = [];
  existingInvoices: any[] = [];
  receivedByName = '';
  isJobLess = false;
  drawerShown = false;
  fullView = false;
  step: 1 | 2 | 3 = 1;
  /** True after a failed attempt to leave or submit the current step; reset once the step changes. */
  stepAttempted = false;

  readonly steps = [
    { n: 1 as const, label: 'LPO & Documents', hint: 'Purchase order and supplier paperwork' },
    { n: 2 as const, label: 'Items', hint: 'Quantities received, accepted and rejected' },
    { n: 3 as const, label: 'Receiving', hint: 'Where the goods go and how they were inspected' },
  ];
  private readonly stepControls: Record<1 | 2 | 3, string[]> = {
    1: ['grnDate', 'supplierDeliveryNoteNo'],
    2: ['items'],
    3: ['warehouse', 'destinationType', 'siteName', 'inspectionResult'],
  };

  get isEdit(): boolean {
    return !!this.grnId;
  }

  get subtitle(): string {
    const hint = this.steps[this.step - 1].hint;
    const ref = [this.isEdit ? this.grnForm.get('grnNo')?.value : '', this.lpo?.poNo].filter(Boolean).join(' · ');
    return ref ? `${ref} · ${hint}` : hint;
  }

  readonly fileAccept = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx';

  /** The items step's header: the receipt's paperwork at a glance. */
  get banner(): { label: string; value: string }[] {
    const v = this.grnForm.getRawValue();
    const warehouse = this.warehouseOptions.find((o) => o.value === v.warehouse)?.label;
    return [
      { label: 'LPO', value: this.lpo?.poNo || '-' },
      { label: 'Supplier', value: v.supplierName || '-' },
      { label: 'Job', value: this.isJobLess ? 'No job' : v.jobId || '-' },
      { label: 'GRN date', value: v.grnDate ? new Date(v.grnDate).toLocaleDateString('en-GB') : '-' },
      { label: 'Delivery note', value: v.supplierDeliveryNoteNo || '-' },
      { label: 'Invoice', value: v.supplierInvoiceNo || '-' },
      { label: v.destinationType === 'site' ? 'Site' : 'Warehouse', value: (v.destinationType === 'site' ? v.siteName : String(warehouse ?? '')) || '-' },
      { label: 'Inspection', value: v.inspectionResult || '-' },
    ];
  }

  isStepValid(step: 1 | 2 | 3): boolean {
    if (step === 1 && !this.lpo) return false;
    return this.stepControls[step].every((name) => !this.grnForm.get(name)?.invalid);
  }

  private markStepTouched(step: 1 | 2 | 3): void {
    this.stepControls[step].forEach((name) => this.grnForm.get(name)?.markAllAsTouched());
    if (step === 1) this.grnForm.get('selectedLpo')?.markAsTouched();
    this.stepAttempted = true;
  }

  goToStep(step: 1 | 2 | 3): void {
    // Forward moves must pass every step in between; going back is always allowed.
    if (step > this.step) {
      for (let s = this.step; s < step; s++) {
        if (!this.isStepValid(s as 1 | 2 | 3)) {
          this.markStepTouched(s as 1 | 2 | 3);
          this.step = s as 1 | 2 | 3;
          if (s === 1 && !this.lpo) this.toastr.warning('Choose an LPO first');
          return;
        }
      }
    }
    this.step = step;
    this.stepAttempted = false;
  }

  nextStep(): void {
    if (this.step < 3) this.goToStep((this.step + 1) as 2 | 3);
  }

  previousStep(): void {
    if (this.step > 1) this.step = (this.step - 1) as 1 | 2;
    this.stepAttempted = false;
  }

  grnForm: FormGroup = this.fb.group({
    selectedLpo: [''],
    grnNo: [{ value: 'Assigned on save', disabled: true }],
    grnDate: [new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), [Validators.required]],
    supplierName: ['', [Validators.required]],
    supplierInvoiceNo: [''],
    supplierInvoiceDate: [''],
    linkedLpoNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    supplierDeliveryNoteNo: ['', [Validators.required, Validators.pattern(/\S/)]],
    receivedBy: ['', [Validators.required]],
    warehouse: ['', [Validators.required]],
    destinationType: ['warehouse', [Validators.required]],
    siteName: [''],
    quarantineWarehouse: [''],
    inspectionResult: ['Passed', [Validators.required]],
    inspectionDate: [''],
    inspectionNotes: [''],
    inspectedBy: [''],
    items: this.fb.array([]),
  });

  ngOnInit(): void {
    this.lpoId = this.drawer
      ? (this.initialLpoId || '')
      : (<string>this.route.snapshot.paramMap.get('lpoId'));
    this.loadWarehouses();
    this.loadEmployees();
    this.setDefaultReceivedBy();
    this.grnForm.get('selectedLpo')?.valueChanges.subscribe((value) => {
      if (value && value !== this.lpoId) this.onLpoSelected(value);
    });
    this.grnForm.get('destinationType')?.valueChanges.subscribe((value) => {
      const siteName = this.grnForm.get('siteName');
      value === 'site' ? siteName?.setValidators([Validators.required]) : siteName?.clearValidators();
      siteName?.updateValueAndValidity({ emitEvent: false });
    });

    if (this.grnId) {
      this.isLpoPreselected.set(true);
      this.loadGrnForEdit();
    } else if (this.lpoId) {
      this.isLpoPreselected.set(true);
      this.loadLpo();
    } else {
      this.isLoading.set(false);
      this.loadEligibleLpos();
    }
  }

  ngAfterViewInit(): void {
    if (this.drawer) setTimeout(() => (this.drawerShown = true));
  }

  isDrawerDirty(): boolean {
    return this.grnForm.dirty || this.deliveryNoteFiles.length > 0 || this.invoiceFiles.length > 0;
  }

  closeDrawer(): void {
    if (!this.drawerShown) return;
    this.drawerShown = false;
    setTimeout(() => this.closed.emit(), 250);
  }

  get lpoSelectOptions(): SfOption[] {
    return this.lpoOptions.map((option) => ({ label: option.label, value: option._id }));
  }

  warehouseOptions: SfOption[] = [];

  employeeOptions: SfOption[] = [];

  readonly destinationOptions: SfOption[] = [
    { label: 'Warehouse', value: 'warehouse' },
    { label: 'Project / Site', value: 'site' },
  ];
  readonly inspectionOptions: SfOption[] = ['Pending', 'Passed', 'Partial', 'Failed']
    .map((value) => ({ label: value, value }));
  loadEligibleLpos(): void {
    this.isLpoOptionsLoading.set(true);
    this.purchaseOrderService
      .getAllPurchaseOrders({
        page: 1,
        row: 500,
        status: ['Placed', 'Closed'],
      })
      .subscribe({
        next: (response: any) => {
          const lpos: any[] = response?.success ? response.data : [];
          if (!lpos.length) {
            this.lpoOptions = [];
            this.isLpoOptionsLoading.set(false);
            return;
          }

          const grnChecks = lpos.map((lpo: any) =>
            this.grnService
              .getAllGRNsByLpoId(lpo._id)
              .pipe(catchError(() => of({ success: false, data: [] }))),
          );

          forkJoin(grnChecks).subscribe((grnResponses: any[]) => {
            this.lpoOptions = lpos
              .filter(
                (lpo: any, index: number) =>
                  !this.isLpoFullyReceived(
                    lpo.items || [],
                    grnResponses[index]?.data || [],
                  ),
              )
              .map((lpo: any) => ({
                _id: lpo._id,
                label: `${lpo.poNo || 'N/A'} - ${lpo.supplierId?.supplierName || 'N/A'}`,
              }));
            this.isLpoOptionsLoading.set(false);
          });
        },
        error: (error) => {
          console.error('Error loading LPOs:', error);
          this.toastr.error('Failed to load LPOs');
          this.isLpoOptionsLoading.set(false);
        },
      });
  }

  private isLpoFullyReceived(lpoItems: any[], grns: any[]): boolean {
    if (!lpoItems.length) return false;

    return lpoItems.every((lpoItem: any) => {
      const orderedQty = lpoItem.quantity || 0;
      if (orderedQty === 0) return true;

      let totalProcessedQty = 0;
      grns.forEach((grn: any) => {
        (grn.items || []).forEach((grnItem: any) => {
          const partNoMatch = this.matchPartNo(grnItem.partNo, lpoItem.partNo);
          const descriptionMatch = grnItem.itemDescription === lpoItem.detail;
          if (partNoMatch || descriptionMatch) {
            totalProcessedQty += grnItem.acceptedQty ?? Math.max(0, (grnItem.receivedQty || 0) - (grnItem.rejectedQty || 0));
          }
        });
      });

      return totalProcessedQty >= orderedQty;
    });
  }

  onLpoSelected(lpoId: string | string[]): void {
    const id = Array.isArray(lpoId) ? lpoId[0] : lpoId;
    if (!id) return;
    this.lpoId = id;
    this.lpo = null;
    this.existingGRNs = [];
    this.isFormDisabled.set(false);
    (this.grnForm.get('items') as FormArray).clear();
    this.isLoading.set(true);
    this.loadLpo();
  }

  loadLpo(): void {
    this.isLoading.set(true);
    this.purchaseOrderService.getPurchaseOrderById(this.lpoId).subscribe({
      next: (response: any) => {
        if (response.success || response._id) {
          const lpoData = response.success ? response.data : response;
          this.lpo = lpoData;

          const jobIdValue = lpoData.purchaseId?.jobId?.jobId || '';
          this.purchaseId = lpoData.purchaseId?._id || lpoData.purchaseId || '';
          this.isJobLess =
            lpoData.purchaseId?.sourceType === 'manual' || !jobIdValue;

          const jobIdControl = this.grnForm.get('jobId');
          if (this.isJobLess) {
            jobIdControl?.clearValidators();
          } else {
            jobIdControl?.setValidators([Validators.required]);
          }
          jobIdControl?.updateValueAndValidity();

          this.grnForm.patchValue({
            supplierName: lpoData.supplierId?.supplierName || '',
            linkedLpoNo: lpoData.poNo || '',
            jobId: jobIdValue,
          });

          if (lpoData.items && Array.isArray(lpoData.items)) {
            this.populateItems(lpoData.items);
            this.checkExistingGrn();
          }
        } else {
          this.toastr.error('LPO not found');
          if (this.isLpoPreselected()) {
            if (this.purchaseId) {
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
            } else {
              this.router.navigate(['/purchase/approves']);
            }
          }
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toastr.error('Failed to load LPO details');
        console.error('Error loading LPO:', error);
        this.isLoading.set(false);
        if (this.isLpoPreselected()) {
          if (this.purchaseId) {
            this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
          } else {
            this.router.navigate(['/purchase/approves']);
          }
        }
      },
    });
  }

  private toDateInput(value: any): string {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
  }

  // Stock was posted from the quantities, warehouse and batch/serial numbers when the GRN was created,
  // so those stay locked; the server ignores them on update anyway.
  loadGrnForEdit(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.grnId!).subscribe({
      next: (response: any) => {
        const grn = response?.data;
        if (!response?.success || !grn) {
          this.toastr.error('GRN not found');
          this.isLoading.set(false);
          this.closeDrawer();
          return;
        }
        const po = grn.purchaseOrderId || {};
        this.lpo = po;
        this.lpoId = po._id || '';
        const jobIdValue = grn.jobId?.jobId || po.purchaseId?.jobId?.jobId || '';
        this.isJobLess = !jobIdValue;
        this.receivedByName = grn.receivedBy
          ? `${grn.receivedBy.firstName || ''} ${grn.receivedBy.lastName || ''}`.trim()
          : this.receivedByName;
        this.existingDeliveryNotes = grn.supplierDeliveryNotes || [];
        this.existingInvoices = grn.supplierInvoices || [];

        this.grnForm.patchValue({
          grnNo: grn.grnNo,
          grnDate: this.toDateInput(grn.grnDate),
          supplierName: po.supplierId?.supplierName || '',
          linkedLpoNo: po.poNo || '',
          jobId: jobIdValue,
          supplierInvoiceNo: grn.supplierInvoiceNo || '',
          supplierInvoiceDate: this.toDateInput(grn.supplierInvoiceDate),
          supplierDeliveryNoteNo: grn.supplierDeliveryNoteNo || '',
          receivedBy: grn.receivedBy?._id || grn.receivedBy || '',
          warehouse: grn.warehouse?._id || grn.warehouse || '',
          destinationType: grn.destinationType || 'warehouse',
          siteName: grn.siteName || '',
          quarantineWarehouse: grn.quarantineWarehouse?._id || grn.quarantineWarehouse || '',
          inspectionResult: grn.inspectionResult || 'Passed',
          inspectionDate: this.toDateInput(grn.inspectionDate),
          inspectionNotes: grn.inspectionNotes || '',
          inspectedBy: grn.inspectedBy?._id || grn.inspectedBy || '',
        });

        const itemsArray = this.items;
        itemsArray.clear();
        (grn.items || []).forEach((item: any, index: number) => {
          const group = this.createItemGroup(item, index);
          // Balance at the time of receipt: what was received minus the recorded over/short.
          group.addControl('balanceQty', this.fb.control((item.receivedQty || 0) - (item.quantityVariance || 0)));
          group.get('uom')?.clearValidators();
          group.get('uom')?.updateValueAndValidity({ emitEvent: false });
          this.validateRejectedQty(group);
          itemsArray.push(group);
        });

        this.grnForm.markAsPristine();
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading GRN:', error);
        this.toastr.error('Failed to load GRN');
        this.isLoading.set(false);
        this.closeDrawer();
      },
    });
  }

  checkExistingGrn(): void {
    this.grnService.getAllGRNsByLpoId(this.lpoId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.existingGRNs = response.data || [];
          this.calculateBalanceQuantities();
        } else {
          this.existingGRNs = [];
          this.calculateBalanceQuantities();
        }
      },
      error: (error) => {
        console.log('Error fetching existing GRNs:', error);
        this.existingGRNs = [];
        this.calculateBalanceQuantities();
      },
    });
  }

  calculateBalanceQuantities(): void {
    const itemsArray = this.grnForm.get('items') as FormArray;
    if (!itemsArray || itemsArray.length === 0) return;

    const lpoItems = this.lpo?.items || [];
    let allBalancesZero = true;

    itemsArray.controls.forEach((itemGroup: any, index: number) => {
      const orderedQty = itemGroup.get('orderedQty')?.value || 0;
      const lpoItem = lpoItems[index];

      let totalProcessedQty = 0;

      this.existingGRNs.forEach((grn: any) => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach((grnItem: any) => {
            const partNoMatch = this.matchPartNo(
              grnItem.partNo,
              lpoItem?.partNo,
            );
            const descriptionMatch =
              grnItem.itemDescription === lpoItem?.detail;

            // Rejected goods are owed again (replacement), so only accepted qty counts against the order,
            // the same rule the server uses to close the LPO.
            if (partNoMatch || descriptionMatch) {
              totalProcessedQty += grnItem.acceptedQty ?? Math.max(0, (grnItem.receivedQty || 0) - (grnItem.rejectedQty || 0));
            }
          });
        }
      });

      const balanceQty = Math.max(0, orderedQty - totalProcessedQty);

      if (!itemGroup.get('balanceQty')) {
        itemGroup.addControl('balanceQty', this.fb.control(balanceQty));
      } else {
        itemGroup.get('balanceQty')?.setValue(balanceQty, { emitEvent: false });
      }

      if (balanceQty > 0) {
        allBalancesZero = false;
      }

      const receivedQtyControl = itemGroup.get('receivedQty');
      if (receivedQtyControl) {
        receivedQtyControl.setValue(balanceQty, { emitEvent: false });
        receivedQtyControl.setValidators([
          Validators.required,
          Validators.min(0),
        ]);
        receivedQtyControl.updateValueAndValidity({ emitEvent: false });
      }

      const rejectedQtyControl = itemGroup.get('rejectedQty');
      if (rejectedQtyControl) {
        rejectedQtyControl.setValue(0, { emitEvent: false });
        rejectedQtyControl.setValidators([
          Validators.min(0),
        ]);
        rejectedQtyControl.updateValueAndValidity({ emitEvent: false });
      }

      const acceptedQtyControl = itemGroup.get('acceptedQty');
      if (acceptedQtyControl) {
        acceptedQtyControl.setValue(balanceQty, { emitEvent: false });
      }
    });

    this.isFormDisabled.set(allBalancesZero);
    const selectedLpoControl = this.grnForm.get('selectedLpo');

    if (allBalancesZero) {
      this.grnForm.disable();
      if (!this.isLpoPreselected()) {
        selectedLpoControl?.enable();
      }
      this.toastr.info(
        'All quantities have been fully received. No new GRN can be created.',
      );
    } else {
      this.grnForm.enable();
      const grnNoControl = this.grnForm.get('grnNo');
      const supplierNameControl = this.grnForm.get('supplierName');
      const linkedLpoNoControl = this.grnForm.get('linkedLpoNo');
      const jobIdControl = this.grnForm.get('jobId');
      if (grnNoControl) grnNoControl.disable();
      if (supplierNameControl) supplierNameControl.disable();
      if (linkedLpoNoControl) linkedLpoNoControl.disable();
      if (jobIdControl) jobIdControl.disable();
    }
  }

  matchPartNo(grnPartNo: any, lpoPartNo: any): boolean {
    const formatPartNo = (partNo: any): string => {
      if (!partNo) return '';
      if (typeof partNo === 'string') return partNo;
      if (partNo.partNo) return partNo.partNo;
      return '';
    };

    // Two lines without a part number are not the same item; matching them sums every unlinked line together.
    const lpoPart = formatPartNo(lpoPartNo);
    return !!lpoPart && formatPartNo(grnPartNo) === lpoPart;
  }

  populateItems(lpoItems: any[]): void {
    const itemsArray = this.grnForm.get('items') as FormArray;
    itemsArray.clear();

    lpoItems.forEach((item: any, index: number) => {
      const orderedQty = item.quantity || 0;
      const itemGroup = this.fb.group({
        slNo: [index + 1],
        partNo: [this.formatPartNumber(item.partNo) || ''],
        itemDescription: [item.detail || ''],
        uom: [''],
        orderedQty: [orderedQty],
        balanceQty: [orderedQty],
        receivedQty: [orderedQty, [Validators.required, Validators.min(0)]],
        acceptedQty: [orderedQty],
        rejectedQty: [0, [Validators.min(0)]],
        discrepancyType: [''],
        rejectionReason: [''],
        trackingType: [item.partNo?.trackingType || 'None'],
        batchNo: [''],
        serialNos: [''],
        expiryDate: [''],
        remarks: [''],
      });

      itemGroup.get('receivedQty')?.valueChanges.subscribe(() => {
        this.onReceivedQtyChanged(itemGroup);
      });

      itemGroup.get('rejectedQty')?.valueChanges.subscribe(() => {
        this.onRejectedQtyChanged(itemGroup);
      });

      itemsArray.push(itemGroup);
    });
  }

  validateReceivedQty(itemGroup: FormGroup): void {
    this.updateDiscrepancyValidation(itemGroup);
  }

  validateRejectedQty(itemGroup: FormGroup): void {
    const rejectedQty = itemGroup.get('rejectedQty')?.value || 0;
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;

    if (rejectedQty > receivedQty) {
      itemGroup.get('rejectedQty')?.setErrors({ max: true });
    } else {
      const errors = itemGroup.get('rejectedQty')?.errors;
      if (errors && errors['max']) {
        delete errors['max'];
        if (Object.keys(errors).length === 0) {
          itemGroup.get('rejectedQty')?.setErrors(null);
        } else {
          itemGroup.get('rejectedQty')?.setErrors(errors);
        }
      }
    }

    this.updateDiscrepancyValidation(itemGroup);
  }

  hasDiscrepancy(itemGroup: FormGroup): boolean {
    return (itemGroup.get('rejectedQty')?.value || 0) > 0 ||
      (itemGroup.get('receivedQty')?.value || 0) !== (itemGroup.get('balanceQty')?.value || 0);
  }

  private updateDiscrepancyValidation(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const balanceQty = itemGroup.get('balanceQty')?.value || 0;
    const rejectedQty = itemGroup.get('rejectedQty')?.value || 0;
    const rejectionReasonControl = itemGroup.get('rejectionReason');
    const discrepancyTypeControl = itemGroup.get('discrepancyType');
    const discrepancyType = receivedQty < balanceQty
      ? 'Shortage'
      : receivedQty > balanceQty
        ? 'Excess'
        : rejectedQty > 0
          ? 'Damaged'
          : '';
    const rejectionReason = receivedQty !== balanceQty
      ? `Received ${receivedQty} against balance ${balanceQty}`
      : rejectedQty > 0
        ? `${rejectedQty} unit(s) rejected`
        : '';
    discrepancyTypeControl?.setValue(discrepancyType, { emitEvent: false });
    rejectionReasonControl?.setValue(rejectionReason, { emitEvent: false });
  }

  onReceivedQtyChanged(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const rejectedQty = Math.min(itemGroup.get('rejectedQty')?.value || 0, receivedQty);
    itemGroup.get('rejectedQty')?.setValue(rejectedQty, { emitEvent: false });
    this.validateReceivedQty(itemGroup);
    this.validateRejectedQty(itemGroup);
    this.calculateAcceptedQty(itemGroup);
  }

  onRejectedQtyChanged(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const rejectedQty = itemGroup.get('rejectedQty')?.value || 0;
    if (rejectedQty > receivedQty) {
      itemGroup.get('rejectedQty')?.setValue(receivedQty, { emitEvent: false });
      this.toastr.warning(`Rejected can't be more than received (${receivedQty}), so it was set to ${receivedQty}.`);
    }
    this.validateReceivedQty(itemGroup);
    this.validateRejectedQty(itemGroup);
    this.calculateAcceptedQty(itemGroup);
  }

  calculateAcceptedQty(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const rejectedQty = Math.min(itemGroup.get('rejectedQty')?.value || 0, receivedQty);
    itemGroup.get('acceptedQty')?.setValue(receivedQty - rejectedQty, { emitEvent: false });
  }

  getItemDisplayValue(itemGroup: FormGroup, fieldName: string): string {
    const value = itemGroup.get(fieldName)?.value;
    return value || '-';
  }

  createItemGroup(item: any, index: number): FormGroup {
    const itemGroup = this.fb.group({
      slNo: [index + 1],
      partNo: [this.formatPartNumber(item.partNo) || item.partNo || ''],
      itemDescription: [item.itemDescription || item.detail || ''],
      uom: [item.uom || '', [Validators.required]],
      orderedQty: [item.orderedQty || item.quantity || 0],
      receivedQty: [
        item.receivedQty || 0,
        [Validators.required, Validators.min(0)],
      ],
      acceptedQty: [item.acceptedQty || 0, [Validators.min(0)]],
      rejectedQty: [item.rejectedQty || 0, [Validators.min(0)]],
      discrepancyType: [item.discrepancyType || ''],
      rejectionReason: [item.rejectionReason || ''],
      trackingType: [item.trackingType || 'None'],
      batchNo: [item.batchNo || ''],
      serialNos: [(item.serialNos || []).join(', ')],
      expiryDate: [item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : ''],
      remarks: [item.remarks || ''],
    });

    this.calculateAcceptedQty(itemGroup);

    itemGroup.get('receivedQty')?.valueChanges.subscribe(() => {
      this.onReceivedQtyChanged(itemGroup);
    });

    itemGroup.get('rejectedQty')?.valueChanges.subscribe(() => {
      this.onRejectedQtyChanged(itemGroup);
    });

    return itemGroup;
  }

  setDefaultReceivedBy(): void {
    this.employeeService.employeeData$.subscribe((emp: any) => {
      if (emp && emp._id && !this.grnForm.get('receivedBy')?.value) {
        this.grnForm.patchValue({ receivedBy: emp._id });
        this.receivedByName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
      }
    });
  }

  loadWarehouses(selectedId?: string): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouses = warehouses;
        this.warehouseOptions = warehouses.map((warehouse) => ({ label: warehouse.wareHouseName, value: warehouse._id }));
        if (selectedId) {
          this.grnForm.patchValue({ warehouse: selectedId });
        } else if (!this.isEdit && !this.grnForm.get('warehouse')?.value && warehouses.length) {
          this.grnForm.patchValue({ warehouse: warehouses[0]._id });
        }
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      },
    });
  }

  loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees.map((emp: any) => ({
          _id: emp._id,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          firstName: emp.firstName,
          lastName: emp.lastName,
        }));
        this.employeeOptions = this.employees.map((employee) => ({ label: employee.name, value: employee._id }));
      },
      error: () => {
        this.toastr.error('Failed to load employees');
      },
    });
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.partNo;
    }
    return '-';
  }

  get items(): FormArray {
    return this.grnForm.get('items') as FormArray;
  }

  get f() {
    return this.grnForm.controls;
  }

  getItemsTotal(field: string): number {
    return this.items.controls.reduce(
      (sum: number, itemGroup: any) =>
        sum + (Number(itemGroup.get(field)?.value) || 0),
      0,
    );
  }

  uploadDeliveryNoteFiles(grnId: string): void {
    if (this.deliveryNoteFiles.length === 0) return;

    const formData = new FormData();
    this.deliveryNoteFiles.forEach((file) => formData.append('files', file));
    if (this.existingDeliveryNotes.length) formData.append('existingFiles', JSON.stringify(this.existingDeliveryNotes));

    this.grnService.updateSupplierDeliveryNotes(grnId, formData).subscribe({
      error: (error) => {
        console.error('Error uploading delivery note:', error);
        this.toastr.error('GRN saved, but failed to upload delivery note');
      },
    });
  }

  uploadInvoiceFiles(grnId: string): void {
    if (this.invoiceFiles.length === 0) return;

    const formData = new FormData();
    this.invoiceFiles.forEach((file) => formData.append('files', file));
    if (this.existingInvoices.length) formData.append('existingFiles', JSON.stringify(this.existingInvoices));

    this.grnService.updateSupplierInvoices(grnId, formData).subscribe({
      error: (error) => {
        console.error('Error uploading invoice:', error);
        this.toastr.error('GRN saved, but failed to upload invoice');
      },
    });
  }

  onSave(): void {
    this.formSubmitted.set(true);

    if (this.isFormDisabled()) {
      this.toastr.warning(
        'All quantities have been fully received. Cannot create new GRN.',
      );
      return;
    }

    const overAccepted = this.isEdit ? [] : (this.grnForm.get('items') as FormArray).controls
      .map((g: any, i: number) => ({ i, accepted: g.get('acceptedQty')?.value || 0, open: g.get('balanceQty')?.value || 0 }))
      .filter((row) => row.accepted > row.open);
    if (overAccepted.length) {
      this.toastr.error(
        overAccepted.map((row) => `Row ${row.i + 1}: accepted ${row.accepted} but only ${row.open} still open`).join(', ') +
        '. Book the extra as rejected with type Excess so it goes back to the supplier.',
        'Too much accepted',
      );
      return;
    }

    if (this.grnForm.invalid) {
      this.grnForm.markAllAsTouched();
      const firstIncomplete = ([1, 2, 3] as const).find((s) => !this.isStepValid(s));
      if (firstIncomplete) this.step = firstIncomplete;
      this.stepAttempted = true;
      setTimeout(() => document.querySelector('.ng-invalid:not(form):not([formArrayName]):not([formGroupName])')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      const invalidFieldLabels: string[] = [];
      const topLevelLabels: Record<string, string> = {
        grnDate: 'GRN Date',
        supplierName: 'Supplier Name',
        linkedLpoNo: 'Linked LPO Number',
        jobId: 'Job ID',
        supplierDeliveryNoteNo: 'Supplier Delivery Note No.',
        receivedBy: 'Received By',
        warehouse: 'Warehouse',
        siteName: 'Project / Site',
      };
      Object.keys(topLevelLabels).forEach((key) => {
        if (this.grnForm.get(key)?.invalid) {
          invalidFieldLabels.push(topLevelLabels[key]);
        }
      });

      const itemsArray = this.grnForm.get('items') as FormArray;
      itemsArray.controls.forEach((itemGroup: any, index: number) => {
        const receivedQty = itemGroup.get('receivedQty');
        const rejectedQty = itemGroup.get('rejectedQty');
        if (rejectedQty?.errors?.['max']) {
          invalidFieldLabels.push(
            `Row ${index + 1}: Rejected Qty (exceeds balance)`,
          );
        }
      });

      if (invalidFieldLabels.length) {
        this.toastr.error(
          `Please correct: ${invalidFieldLabels.join(', ')}`,
          'Invalid form',
        );
      } else {
        this.toastr.warning('Please fill all required fields correctly');
      }
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.grnForm.getRawValue();

    const grnData = {
      grnDate: formValue.grnDate,
      purchaseOrderId: this.lpoId,
      supplierInvoiceNo: formValue.supplierInvoiceNo || undefined,
      supplierInvoiceDate: formValue.supplierInvoiceDate || undefined,
      supplierDeliveryNoteNo: formValue.supplierDeliveryNoteNo?.trim() || undefined,
      receivedBy: formValue.receivedBy || undefined,
      warehouse: formValue.warehouse,
      destinationType: formValue.destinationType,
      siteName: formValue.siteName || undefined,
      quarantineWarehouse: formValue.quarantineWarehouse || undefined,
      inspectionResult: formValue.inspectionResult,
      inspectionDate: formValue.inspectionDate || undefined,
      inspectionNotes: formValue.inspectionNotes || undefined,
      inspectedBy: formValue.inspectedBy || undefined,
      items: formValue.items.map((item: any) => ({
        partNo: item.partNo !== '-' ? item.partNo : undefined,
        itemDescription: item.itemDescription,
        uom: item.uom || undefined,
        orderedQty: item.orderedQty,
        receivedQty: item.receivedQty,
        acceptedQty: item.acceptedQty,
        rejectedQty: item.rejectedQty || 0,
        quantityVariance: (item.receivedQty || 0) - (item.balanceQty || 0),
        discrepancyType: item.discrepancyType || undefined,
        rejectionReason: item.rejectionReason || undefined,
        batchNo: item.batchNo || undefined,
        serialNos: item.serialNos
          ? item.serialNos.split(/[\n,;]+/).map((serial: string) => serial.trim()).filter(Boolean)
          : [],
        expiryDate: item.expiryDate || undefined,
        trackingType: item.trackingType || 'None',
        remarks: item.remarks || undefined,
      })),
    };

    if (this.isEdit) {
      this.grnService.updateGRN(this.grnId!, grnData).subscribe({
        next: (response: any) => {
          if (!response.success) {
            this.toastr.error('Failed to update GRN');
            this.isSubmitting.set(false);
            return;
          }
          this.toastr.success(`${formValue.grnNo} updated`);
          this.uploadDeliveryNoteFiles(this.grnId!);
          this.uploadInvoiceFiles(this.grnId!);
          this.saved.emit();
          this.closeDrawer();
        },
        error: (error) => {
          console.error('Error updating GRN:', error);
          this.toastr.error(error.error?.message || 'Failed to update GRN');
          this.isSubmitting.set(false);
        },
      });
      return;
    }

    this.grnService.createGRN(grnData).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.toastr.success(response.data?.grnNo ? `${response.data.grnNo} saved` : 'GRN saved successfully');
          if (response.warnings && response.warnings.length > 0) {
            response.warnings.forEach((warning: string) => {
              this.toastr.warning(warning, '', { timeOut: 5000 });
            });
          }
          const createdGrnId = response.data?._id;
          if (createdGrnId) {
            this.uploadDeliveryNoteFiles(createdGrnId);
            this.uploadInvoiceFiles(createdGrnId);
          }
          if (this.drawer) {
            this.saved.emit();
            this.closeDrawer();
          } else if (createdGrnId) {
            this.router.navigate(['/grn/view-grn', createdGrnId]);
          } else if (this.purchaseId) {
            this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
          } else {
            this.router.navigate(['/purchase/approves']);
          }
        } else {
          this.toastr.error('Failed to save GRN');
          this.isSubmitting.set(false);
        }
      },
      error: (error) => {
        console.error('Error saving GRN:', error);
        this.toastr.error(error.error?.message || 'Failed to save GRN');
        this.isSubmitting.set(false);
      },
    });
  }

  onDiscard(): void {
    if (this.drawer) {
      this.closeDrawer();
      return;
    }
    if (!this.isLpoPreselected()) {
      this.router.navigate(['/grn/grn-list']);
      return;
    }
    if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase/approves']);
    }
  }
}
