import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { AddWarehouseComponent } from 'src/app/modules/inventory/pages/all-products/modals/add-warehouse/add-warehouse.component';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-create-grn',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ButtonComponent,
    IconsModule,
    MatTooltipModule
  ],
  templateUrl: './create-grn.component.html',
  styleUrl: './create-grn.component.css'
})
export class CreateGrnComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private grnService = inject(GrnService);
  private warehouseService = inject(WarehouseService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);

  lpoId!: string;
  purchaseId!: string;
  lpo: any = null;
  warehouses: any[] = [];
  employees: any[] = [];
  lpoOptions: any[] = [];
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);
  isFormDisabled = signal<boolean>(false);
  isLpoPreselected = signal<boolean>(false);
  existingGRNs: any[] = [];
  deliveryNoteFiles: File[] = [];
  invoiceFiles: File[] = [];

  grnForm: FormGroup = this.fb.group({
    selectedLpo: [''],
    grnNo: ['', [Validators.required]],
    grnDate: ['', [Validators.required]],
    supplierName: ['', [Validators.required]],
    supplierInvoiceNo: [''],
    supplierInvoiceDate: [''],
    linkedLpoNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    supplierDeliveryNoteNo: [''],
    receivedBy: [''],
    warehouse: ['', [Validators.required]],
    items: this.fb.array([])
  });

  ngOnInit(): void {
    this.lpoId = <string>this.route.snapshot.paramMap.get('lpoId');
    this.loadWarehouses();
    this.loadEmployees();
    this.generateGRNNumber();

    if (this.lpoId) {
      this.isLpoPreselected.set(true);
      this.loadLpo();
    } else {
      this.isLoading.set(false);
      this.loadEligibleLpos();
    }
  }

  loadEligibleLpos(): void {
    this.purchaseOrderService.getAllPurchaseOrders({ page: 1, row: 500, status: ['Approved', 'Closed'] }).subscribe({
      next: (response: any) => {
        this.lpoOptions = (response?.success ? response.data : []).map((lpo: any) => ({
          _id: lpo._id,
          label: `${lpo.poNo || 'N/A'} - ${lpo.supplierId?.supplierName || 'N/A'}`
        }));
      },
      error: (error) => {
        console.error('Error loading LPOs:', error);
        this.toastr.error('Failed to load LPOs');
      }
    });
  }

  onLpoSelected(lpoId: string | string[]): void {
    const id = Array.isArray(lpoId) ? lpoId[0] : lpoId;
    if (!id) return;
    this.lpoId = id;
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
          
          this.grnForm.patchValue({
            supplierName: lpoData.supplierId?.supplierName || '',
            linkedLpoNo: lpoData.poNo || '',
            jobId: jobIdValue
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
      }
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
      }
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
      
      let totalAcceptedQty = 0;
      
      this.existingGRNs.forEach((grn: any) => {
        if (grn.items && Array.isArray(grn.items)) {
          grn.items.forEach((grnItem: any) => {
            const partNoMatch = this.matchPartNo(grnItem.partNo, lpoItem?.partNo);
            const descriptionMatch = grnItem.itemDescription === lpoItem?.detail;
            
            if (partNoMatch || descriptionMatch) {
              totalAcceptedQty += grnItem.acceptedQty || 0;
            }
          });
        }
      });

      const balanceQty = Math.max(0, orderedQty - totalAcceptedQty);
      
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
          Validators.max(balanceQty)
        ]);
        receivedQtyControl.updateValueAndValidity({ emitEvent: false });
      }

      const acceptedQtyControl = itemGroup.get('acceptedQty');
      if (acceptedQtyControl) {
        acceptedQtyControl.setValue(balanceQty, { emitEvent: false });
        const currentReceivedQty = itemGroup.get('receivedQty')?.value || balanceQty;
        const maxAcceptedQty = Math.min(balanceQty, currentReceivedQty);
        acceptedQtyControl.setValidators([
          Validators.required,
          Validators.min(0),
          Validators.max(maxAcceptedQty)
        ]);
        acceptedQtyControl.updateValueAndValidity({ emitEvent: false });
      }
    });

    this.isFormDisabled.set(allBalancesZero);
    
    if (allBalancesZero) {
      this.grnForm.disable();
      this.toastr.info('All quantities have been fully received. No new GRN can be created.');
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
    
    return formatPartNo(grnPartNo) === formatPartNo(lpoPartNo);
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
        acceptedQty: [orderedQty, [Validators.required, Validators.min(0)]],
        rejectedQty: [0],
        remarks: [''],
        date: ['']
      });
      
      itemGroup.get('receivedQty')?.valueChanges.subscribe(() => {
        this.calculateRejectedQty(itemGroup);
        this.validateReceivedQty(itemGroup);
      });
      
      itemGroup.get('acceptedQty')?.valueChanges.subscribe(() => {
        this.calculateRejectedQty(itemGroup);
        this.validateAcceptedQty(itemGroup);
      });
      
      itemsArray.push(itemGroup);
    });
  }

  validateReceivedQty(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const balanceQty = itemGroup.get('balanceQty')?.value || 0;
    
    if (receivedQty > balanceQty) {
      itemGroup.get('receivedQty')?.setErrors({ max: true });
    } else {
      const errors = itemGroup.get('receivedQty')?.errors;
      if (errors && errors['max']) {
        delete errors['max'];
        if (Object.keys(errors).length === 0) {
          itemGroup.get('receivedQty')?.setErrors(null);
        } else {
          itemGroup.get('receivedQty')?.setErrors(errors);
        }
      }
    }
  }

  validateAcceptedQty(itemGroup: FormGroup): void {
    const acceptedQty = itemGroup.get('acceptedQty')?.value || 0;
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const balanceQty = itemGroup.get('balanceQty')?.value || 0;
    
    if (acceptedQty > receivedQty) {
      itemGroup.get('acceptedQty')?.setErrors({ max: true });
    } else if (acceptedQty > balanceQty) {
      itemGroup.get('acceptedQty')?.setErrors({ maxBalance: true });
    } else {
      const errors = itemGroup.get('acceptedQty')?.errors;
      if (errors) {
        if (errors['max']) delete errors['max'];
        if (errors['maxBalance']) delete errors['maxBalance'];
        if (Object.keys(errors).length === 0) {
          itemGroup.get('acceptedQty')?.setErrors(null);
        } else {
          itemGroup.get('acceptedQty')?.setErrors(errors);
        }
      }
    }
  }

  calculateRejectedQty(itemGroup: FormGroup): void {
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const acceptedQty = itemGroup.get('acceptedQty')?.value || 0;
    const rejectedQty = Math.max(0, receivedQty - acceptedQty);
    itemGroup.get('rejectedQty')?.setValue(rejectedQty, { emitEvent: false });
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
      uom: [item.uom || ''],
      orderedQty: [item.orderedQty || item.quantity || 0],
      receivedQty: [item.receivedQty || 0, [Validators.required, Validators.min(0)]],
      acceptedQty: [item.acceptedQty || 0, [Validators.required, Validators.min(0)]],
      rejectedQty: [0],
      remarks: [item.remarks || ''],
      date: [item.date ? new Date(item.date).toISOString().split('T')[0] : '']
    });
    
    const receivedQty = itemGroup.get('receivedQty')?.value || 0;
    const acceptedQty = itemGroup.get('acceptedQty')?.value || 0;
    const rejectedQty = Math.max(0, receivedQty - acceptedQty);
    itemGroup.get('rejectedQty')?.setValue(rejectedQty, { emitEvent: false });
    
    itemGroup.get('receivedQty')?.valueChanges.subscribe(() => {
      this.calculateRejectedQty(itemGroup);
    });
    
    itemGroup.get('acceptedQty')?.valueChanges.subscribe(() => {
      this.calculateRejectedQty(itemGroup);
    });
    
    return itemGroup;
  }

  generateGRNNumber(): void {
    this.grnService.generateGRNNumber().subscribe({
      next: (response: any) => {
        const grnNo = response.grn || response.data?.grn;
        if (grnNo) {
          this.grnForm.patchValue({ grnNo });
        }
      },
      error: (error) => {
        console.error('Error generating GRN number:', error);
        this.toastr.error('Failed to generate GRN number');
      }
    });
  }

  loadWarehouses(selectedId?: string): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouses = warehouses;
        if (selectedId) {
          this.grnForm.patchValue({ warehouse: selectedId });
        }
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      }
    });
  }

  onAddWarehouse(): void {
    const dialogRef = this.dialog.open(AddWarehouseComponent, {
      width: '500px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadWarehouses(result._id);
      }
    });
  }

  loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees.map((emp: any) => ({
          _id: emp._id,
          name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
          firstName: emp.firstName,
          lastName: emp.lastName
        }));
      },
      error: () => {
        this.toastr.error('Failed to load employees');
      }
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

  openDeliveryNoteUpload(): void {
    const modalData: FileUploadModalData = {
      title: 'Upload Supplier Delivery Note',
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
      showActions: {
        upload: true,
        download: false,
        view: false,
        delete: true
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        this.deliveryNoteFiles = result.files
          .filter((file: any) => file.file)
          .map((file: any) => file.file);
      }
    });
  }

  uploadDeliveryNoteFiles(grnId: string): void {
    if (this.deliveryNoteFiles.length === 0) return;

    const formData = new FormData();
    this.deliveryNoteFiles.forEach(file => formData.append('files', file));

    this.grnService.updateSupplierDeliveryNotes(grnId, formData).subscribe({
      error: (error) => {
        console.error('Error uploading delivery note:', error);
        this.toastr.error('GRN saved, but failed to upload delivery note');
      }
    });
  }

  openInvoiceUpload(): void {
    const modalData: FileUploadModalData = {
      title: 'Upload Supplier Invoice',
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
      showActions: {
        upload: true,
        download: false,
        view: false,
        delete: true
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        this.invoiceFiles = result.files
          .filter((file: any) => file.file)
          .map((file: any) => file.file);
      }
    });
  }

  uploadInvoiceFiles(grnId: string): void {
    if (this.invoiceFiles.length === 0) return;

    const formData = new FormData();
    this.invoiceFiles.forEach(file => formData.append('files', file));

    this.grnService.updateSupplierInvoices(grnId, formData).subscribe({
      error: (error) => {
        console.error('Error uploading invoice:', error);
        this.toastr.error('GRN saved, but failed to upload invoice');
      }
    });
  }

  onSave(): void {
    if (this.isFormDisabled()) {
      this.toastr.warning('All quantities have been fully received. Cannot create new GRN.');
      return;
    }

    if (this.grnForm.invalid) {
      this.grnForm.markAllAsTouched();
      const itemsArray = this.grnForm.get('items') as FormArray;
      itemsArray.controls.forEach((itemGroup: any) => {
        const receivedQty = itemGroup.get('receivedQty');
        const acceptedQty = itemGroup.get('acceptedQty');
        if (receivedQty?.errors?.['max']) {
          this.toastr.error('Received quantity cannot exceed balance quantity');
        }
        if (acceptedQty?.errors?.['max']) {
          this.toastr.error('Accepted quantity cannot exceed received quantity');
        }
        if (acceptedQty?.errors?.['maxBalance']) {
          this.toastr.error('Accepted quantity cannot exceed balance quantity');
        }
      });
      this.toastr.warning('Please fill all required fields correctly');
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.grnForm.getRawValue();
    
    const grnData = {
      grnNo: formValue.grnNo,
      grnDate: formValue.grnDate,
      purchaseOrderId: this.lpoId,
      supplierInvoiceNo: formValue.supplierInvoiceNo || undefined,
      supplierInvoiceDate: formValue.supplierInvoiceDate || undefined,
      supplierDeliveryNoteNo: formValue.supplierDeliveryNoteNo || undefined,
      receivedBy: formValue.receivedBy || undefined,
      warehouse: formValue.warehouse,
      items: formValue.items.map((item: any) => ({
        partNo: item.partNo !== '-' ? item.partNo : undefined,
        itemDescription: item.itemDescription,
        uom: item.uom || undefined,
        orderedQty: item.orderedQty,
        receivedQty: item.receivedQty,
        acceptedQty: item.acceptedQty,
        remarks: item.remarks || undefined,
        date: item.date || undefined
      }))
    };

    this.grnService.createGRN(grnData).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.toastr.success('GRN saved successfully');
          if (response.warnings && response.warnings.length > 0) {
            response.warnings.forEach((warning: string) => {
              this.toastr.warning(warning, '', { timeOut: 5000 });
            });
          }
          const createdGrnId = response.data?._id;
          if (createdGrnId) {
            this.uploadDeliveryNoteFiles(createdGrnId);
            this.uploadInvoiceFiles(createdGrnId);
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
      }
    });
  }

  onDiscard(): void {
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
