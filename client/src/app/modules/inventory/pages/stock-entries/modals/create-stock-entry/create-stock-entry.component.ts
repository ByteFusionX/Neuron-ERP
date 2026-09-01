import { Component, inject, Inject, Optional, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { StockEntryService } from 'src/app/core/services/stock-entry/stock-entry.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ProductService } from 'src/app/core/services/product/product.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { JobService } from 'src/app/core/services/job/job.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { AddWarehouseComponent } from '../../../all-products/modals/add-warehouse/add-warehouse.component';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-create-stock-entry',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    ButtonComponent,
    IconsModule,
    ModalLayoutComponent
  ],
  templateUrl: './create-stock-entry.component.html',
  styleUrl: './create-stock-entry.component.css'
})
export class CreateStockEntryComponent implements OnInit {
  private fb = inject(FormBuilder);
  private stockEntryService = inject(StockEntryService);
  private productCategoryService = inject(ProductCategoryService);
  private warehouseService = inject(WarehouseService);
  private profileService = inject(ProfileService);
  private productService = inject(ProductService);
  private supplierService = inject(SupplierService);
  private jobService = inject(JobService);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  isSubmitting = false;
  isLoadingGRN = false;
  isEditMode = false;

  departments: getDepartment[] = [];
  categories: any[] = [];
  warehouses: any[] = [];
  products: any[] = [];
  suppliers: any[] = [];
  jobIds: any[] = [];

  stockEntryForm: FormGroup = this.fb.group({
    grn: ['', [Validators.required]],
    partNo: ['', [Validators.required]],
    itemCode: [''],
    dateOfPurchase: [new Date().toISOString().split('T')[0], [Validators.required]],
    jobId: [''],
    supplierName: ['', [Validators.required]],
    supplierLpoNo: [''],
    productDescription: ['', [Validators.required]],
    productSegment: ['', [Validators.required]],
    productCategory: ['', [Validators.required]],
    targetWarehouse: ['', [Validators.required]],
    quantity: ['', [Validators.required, Validators.min(1)]],
    uom: [''],
    unitCost: ['', [Validators.required, Validators.min(0)]],
    totalCost: ['', [Validators.required, Validators.min(0)]],
    sellingPrice: [''],
    remarks: [''],
    serialNumbers: this.fb.array([])
  });

  constructor(
    @Optional() public dialogRef: MatDialogRef<CreateStockEntryComponent> | null,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.isEditMode = !!this.data?.stockEntry;
  }

  ngOnInit(): void {
    if (!this.isEditMode) {
      this.loadGRN();
    }
    this.loadDepartments();
    this.loadCategories();
    this.loadWarehouses();
    this.loadProducts();
    this.loadSuppliers();
    this.loadJobIds();
    this.setupTotalCostCalculation();

    if (this.isEditMode) {
      this.patchFormForEdit(this.data.stockEntry);
    } else {
      // Add one initial serial number input
      this.addSerialNumber();
    }
  }

  private patchFormForEdit(entry: any): void {
    const serialNumbers = Array.isArray(entry?.serialNumbers) && entry.serialNumbers.length
      ? entry.serialNumbers
      : [''];
    serialNumbers.forEach((sn: string) => {
      this.serialNumbersArray.push(this.fb.control(sn || ''));
    });

    this.stockEntryForm.patchValue({
      grn: entry?.grn || '',
      partNo: entry?.partNo?._id || entry?.partNo || '',
      itemCode: entry?.itemCode || entry?.partNo?.itemCode || '',
      dateOfPurchase: entry?.dateOfPurchase ? new Date(entry.dateOfPurchase).toISOString().split('T')[0] : '',
      jobId: entry?.jobId?._id || entry?.jobId || '',
      supplierName: entry?.supplierName?._id || entry?.supplierName || '',
      supplierLpoNo: entry?.supplierLpoNo || '',
      productDescription: entry?.productDescription || '',
      productSegment: entry?.productSegment?._id || entry?.productSegment || '',
      productCategory: entry?.productCategory?._id || entry?.productCategory || '',
      targetWarehouse: entry?.targetWarehouse?._id || entry?.targetWarehouse || '',
      quantity: entry?.quantity ?? '',
      uom: entry?.uom || '',
      unitCost: entry?.unitCost ?? '',
      totalCost: entry?.totalCost ?? '',
      sellingPrice: entry?.sellingPrice ?? '',
      remarks: entry?.remarks || ''
    });
  }

  // Manual stock entry creation is being reworked; grn is no longer an auto-generated
  // string (it's now a reference to a real GRN document), so this no longer applies.
  loadGRN(): void {
    this.isLoadingGRN = false;
  }

  loadDepartments(): void {
    this.profileService.getDepartments().subscribe({
      next: (departments) => {
        this.departments = departments;
      },
      error: () => {
        this.toastr.error('Failed to load departments');
      }
    });
  }

  loadCategories(selectedId?: string): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        if (selectedId) {
          this.stockEntryForm.patchValue({ productCategory: selectedId });
        }
      },
      error: () => {
        this.toastr.error('Failed to load categories');
      }
    });
  }

  loadWarehouses(selectedId?: string): void {
    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouses = warehouses;
        if (selectedId) {
          this.stockEntryForm.patchValue({ targetWarehouse: selectedId });
        }
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      }
    });
  }

  loadProducts(): void {
    this.productService.getProducts({ page: 1, row: 1000 }).subscribe({
      next: (response) => {
        const products = response.data?.products ?? [];
        this.products = products.map((product: any) => ({
          ...product,
          displayLabel: `${product.partNo} - ${product.productDescription}`
        }));
      },
      error: () => {
        this.toastr.error('Failed to load products');
      }
    });
  }

  loadSuppliers(): void {
    this.supplierService.supplierList().subscribe({
      next: (response: any) => {
        const suppliers = response.data || response || [];
        this.suppliers = suppliers;

        // The supplier list only returns approved/unblocked suppliers, so an
        // entry's existing supplier may be missing from it (e.g. blocked since).
        // Ensure it's still present so the dropdown can resolve its name.
        const currentSupplier = this.isEditMode ? this.data?.stockEntry?.supplierName : null;
        if (currentSupplier && typeof currentSupplier === 'object' && currentSupplier._id) {
          const exists = this.suppliers.some((s: any) => s._id === currentSupplier._id);
          if (!exists) {
            this.suppliers = [...this.suppliers, currentSupplier];
          }
        }
      },
      error: () => {
        this.toastr.error('Failed to load suppliers');
      }
    });
  }

  loadJobIds(): void {
    this.jobService.getJobIdsWithApprovedPOAndNoGRN().subscribe({
      next: (response) => {
        const jobs = Array.isArray(response)
          ? response
          : (response as any)?.jobs || (response as any)?.data || [];
        this.jobIds = jobs;

        // The list only contains jobs with an approved PO and no GRN yet, so an
        // entry being edited may reference a job that no longer qualifies.
        // Ensure it's still present so the dropdown can resolve its value.
        const currentJob = this.isEditMode ? this.data?.stockEntry?.jobId : null;
        if (currentJob && typeof currentJob === 'object' && currentJob._id) {
          const exists = this.jobIds.some((j: any) => j._id === currentJob._id);
          if (!exists) {
            this.jobIds = [...this.jobIds, currentJob];
          }
        }
      },
      error: () => {
        this.toastr.error('Failed to load job IDs');
      }
    });
  }

  onProductChange(productId: string | string[]): void {
    const id = Array.isArray(productId) ? productId[0] : productId;
    const product = this.products.find(p => p._id === id);
    this.applyProduct(product);
  }

  onItemCodeChange(itemCode: string | string[]): void {
    const code = Array.isArray(itemCode) ? itemCode[0] : itemCode;
    const product = this.products.find(p => p.itemCode === code);
    this.applyProduct(product);
  }

  private applyProduct(product: any): void {
    if (!product) {
      return;
    }
    this.stockEntryForm.patchValue({
      partNo: product._id || '',
      itemCode: product.itemCode || '',
      productDescription: product.productDescription || '',
      productSegment: product.productSegment?._id || product.productSegment || '',
      productCategory: product.productCategory?._id || product.productCategory || '',
      targetWarehouse: product.warehouse?._id || product.warehouse || product.targetWarehouse?._id || product.targetWarehouse || ''
    });
  }

  setupTotalCostCalculation(): void {
    this.stockEntryForm.get('quantity')?.valueChanges.subscribe(() => {
      this.calculateTotalCost();
    });

    this.stockEntryForm.get('unitCost')?.valueChanges.subscribe(() => {
      this.calculateTotalCost();
    });
  }

  calculateTotalCost(): void {
    const quantity = parseFloat(this.stockEntryForm.get('quantity')?.value) || 0;
    const unitCost = parseFloat(this.stockEntryForm.get('unitCost')?.value) || 0;
    const totalCost = quantity * unitCost;
    this.stockEntryForm.patchValue({ totalCost: totalCost.toFixed(2) }, { emitEvent: false });
  }

  onAddCategory(): void {
    this.router.navigate(['/inventory/products/category/add']);
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

  get serialNumbersArray(): FormArray {
    return this.stockEntryForm.get('serialNumbers') as FormArray;
  }

  addSerialNumber(): void {
    this.serialNumbersArray.push(this.fb.control(''));
  }

  removeSerialNumber(index: number): void {
    this.serialNumbersArray.removeAt(index);
  }

  onSubmit(): void {
    if (this.stockEntryForm.invalid) {
      this.stockEntryForm.markAllAsTouched();
      this.toastr.error('Please fill all required fields');
      return;
    }

    const formValue = this.stockEntryForm.value;
    const serialNumbers = formValue.serialNumbers 
      ? formValue.serialNumbers.map((sn: string) => sn.trim()).filter((sn: string) => sn)
      : [];

    const payload = {
      ...formValue,
      quantity: parseFloat(formValue.quantity),
      unitCost: parseFloat(formValue.unitCost),
      totalCost: parseFloat(formValue.totalCost),
      serialNumbers: serialNumbers,
      jobId: formValue.jobId || undefined
    };

    this.isSubmitting = true;

    if (this.isEditMode) {
      this.stockEntryService.updateStockEntry(this.data.stockEntry._id, payload).subscribe({
        next: (stockEntry) => {
          this.toastr.success('Stock entry updated successfully');
          this.dialogRef?.close(stockEntry);
        },
        error: (error) => {
          this.toastr.error(error.error?.message || 'Failed to update stock entry');
          this.isSubmitting = false;
        }
      });
      return;
    }

    this.stockEntryService.createStockEntry(payload).subscribe({
      next: (stockEntry) => {
        this.toastr.success('Stock entry created successfully');
        this.router.navigate(['/inventory/stock-entries']);
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to create stock entry');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    if (this.isEditMode) {
      this.dialogRef?.close();
      return;
    }
    this.router.navigate(['/inventory/stock-entries']);
  }
}

