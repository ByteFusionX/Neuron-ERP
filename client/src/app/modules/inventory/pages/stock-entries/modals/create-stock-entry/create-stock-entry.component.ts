import { Component, inject, OnInit } from '@angular/core';
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
import { MatDialog } from '@angular/material/dialog';
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

  departments: getDepartment[] = [];
  categories: any[] = [];
  warehouses: any[] = [];
  products: any[] = [];
  suppliers: any[] = [];
  jobIds: any[] = [];

  stockEntryForm: FormGroup = this.fb.group({
    grn: ['', [Validators.required]],
    partNo: ['', [Validators.required]],
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

  constructor() {}

  ngOnInit(): void {
    this.loadGRN();
    this.loadDepartments();
    this.loadCategories();
    this.loadWarehouses();
    this.loadProducts();
    this.loadSuppliers();
    this.loadJobIds();
    this.setupTotalCostCalculation();
    // Add one initial serial number input
    this.addSerialNumber();
  }

  loadGRN(): void {
    this.isLoadingGRN = true;
    this.stockEntryService.generateGRN().subscribe({
      next: (response) => {
        this.stockEntryForm.patchValue({ grn: response.grn });
        this.isLoadingGRN = false;
      },
      error: () => {
        this.toastr.error('Failed to generate GRN');
        this.isLoadingGRN = false;
      }
    });
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
      },
      error: () => {
        this.toastr.error('Failed to load suppliers');
      }
    });
  }

  loadJobIds(): void {
    this.jobService.getJobids().subscribe({
      next: (response) => {
        const jobs = Array.isArray(response)
          ? response
          : (response as any)?.jobs || (response as any)?.data || [];
        this.jobIds = jobs;
      },
      error: () => {
        this.toastr.error('Failed to load job IDs');
      }
    });
  }

  onProductChange(productId: string | string[]): void {
    const id = Array.isArray(productId) ? productId[0] : productId;
    const product = this.products.find(p => p._id === id);
    if (product) {
      this.stockEntryForm.patchValue({
        productDescription: product.productDescription || '',
        productSegment: product.productSegment?._id || product.productSegment || '',
        productCategory: product.productCategory?._id || product.productCategory || '',
        targetWarehouse: product.warehouse?._id || product.warehouse || product.targetWarehouse?._id || product.targetWarehouse || ''
      });
    }
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
    this.router.navigate(['/inventory/stock-entries']);
  }
}

