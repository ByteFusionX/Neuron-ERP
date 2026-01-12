import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-create-grn',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ButtonComponent
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

  lpoId!: string;
  purchaseId!: string;
  lpo: any = null;
  warehouses: any[] = [];
  employees: any[] = [];
  isLoading = signal<boolean>(true);
  isSubmitting = signal<boolean>(false);

  grnForm: FormGroup = this.fb.group({
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
    if (!this.lpoId) {
      this.toastr.error('Invalid LPO ID');
      const purchaseIdFromRoute = this.route.snapshot.queryParams['purchaseId'] || this.route.snapshot.paramMap.get('purchaseId');
      if (purchaseIdFromRoute) {
        this.router.navigate(['/purchase/initiate-lpo', purchaseIdFromRoute]);
      } else {
        this.router.navigate(['/purchase-order/pending-approval']);
      }
      return;
    }
    this.loadLpo();
    this.loadWarehouses();
    this.loadEmployees();
    this.generateGRNNumber();
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
          }

          this.checkExistingGrn();
        } else {
          this.toastr.error('LPO not found');
          if (this.purchaseId) {
            this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
          } else {
            this.router.navigate(['/purchase-order/pending-approval']);
          }
        }
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toastr.error('Failed to load LPO details');
        console.error('Error loading LPO:', error);
        this.isLoading.set(false);
        if (this.purchaseId) {
          this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
        } else {
          this.router.navigate(['/purchase-order/pending-approval']);
        }
      }
    });
  }

  checkExistingGrn(): void {
    this.grnService.getGRNByLpoId(this.lpoId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          const grn = response.data;
          this.grnForm.patchValue({
            grnNo: grn.grnNo || '',
            grnDate: grn.grnDate ? new Date(grn.grnDate).toISOString().split('T')[0] : '',
            supplierInvoiceNo: grn.supplierInvoiceNo || '',
            supplierInvoiceDate: grn.supplierInvoiceDate ? new Date(grn.supplierInvoiceDate).toISOString().split('T')[0] : '',
            supplierDeliveryNoteNo: grn.supplierDeliveryNoteNo || '',
            receivedBy: grn.receivedBy?._id || grn.receivedBy || '',
            warehouse: grn.warehouse?._id || grn.warehouse || ''
          });

          if (grn.items && Array.isArray(grn.items)) {
            const itemsArray = this.grnForm.get('items') as FormArray;
            itemsArray.clear();
            grn.items.forEach((item: any, index: number) => {
              const itemGroup = this.createItemGroup(item, index);
              itemsArray.push(itemGroup);
            });
          }
        }
      },
      error: (error) => {
        console.log('No existing GRN found or error:', error);
      }
    });
  }

  populateItems(lpoItems: any[]): void {
    const itemsArray = this.grnForm.get('items') as FormArray;
    itemsArray.clear();
    
    lpoItems.forEach((item: any, index: number) => {
      const itemGroup = this.fb.group({
        slNo: [index + 1],
        partNo: [this.formatPartNumber(item.partNo) || ''],
        itemDescription: [item.detail || ''],
        uom: [''],
        orderedQty: [item.quantity || 0],
        receivedQty: [0, [Validators.required, Validators.min(0)]],
        acceptedQty: [0, [Validators.required, Validators.min(0)]],
        rejectedQty: [0],
        remarks: [''],
        date: ['']
      });
      
      itemGroup.get('receivedQty')?.valueChanges.subscribe(() => {
        this.calculateRejectedQty(itemGroup);
      });
      
      itemGroup.get('acceptedQty')?.valueChanges.subscribe(() => {
        this.calculateRejectedQty(itemGroup);
      });
      
      itemsArray.push(itemGroup);
    });
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

  loadWarehouses(): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouses = warehouses;
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
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

  onSave(): void {
    if (this.grnForm.invalid) {
      this.grnForm.markAllAsTouched();
      this.toastr.warning('Please fill all required fields');
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.grnForm.value;
    
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
          if (this.purchaseId) {
            this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
          } else {
            this.router.navigate(['/purchase-order/pending-approval']);
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
    if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase-order/pending-approval']);
    }
  }
}
