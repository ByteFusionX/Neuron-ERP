import { Component, Inject, inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ProductService } from 'src/app/core/services/product/product.service';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { AddWarehouseComponent } from '../add-warehouse/add-warehouse.component';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-create-product',
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
  templateUrl: './create-product.component.html',
  styleUrl: './create-product.component.css'
})
export class CreateProductComponent implements OnInit {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private productCategoryService = inject(ProductCategoryService);
  private warehouseService = inject(WarehouseService);
  private profileService = inject(ProfileService);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  isSubmitting = false;
  isEditMode = false;
  createdByDisplay = new FormControl({ value: '', disabled: true });

  departments: getDepartment[] = [];
  categories: any[] = [];
  warehouses: any[] = [];

  productForm: FormGroup = this.fb.group({
    partNo: ['', [Validators.required]],
    itemCode: ['', [Validators.required]],
    createdDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    productDescription: ['', [Validators.required]],
    productSegment: ['', [Validators.required]],
    productCategory: ['', [Validators.required]],
    warehouse: ['', [Validators.required]]
  });

  constructor(
    public dialogRef: MatDialogRef<CreateProductComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.isEditMode = !!this.data?.product;
  }

  ngOnInit(): void {
    this.loadDepartments();
    this.loadCategories();
    this.loadWarehouses();

    if (this.isEditMode) {
      this.patchFormForEdit(this.data.product);
    } else if (this.data?.prefill) {
      this.applyPrefill(this.data.prefill);
    }
  }

  private applyPrefill(prefill: { productSegment?: string; productCategoryName?: string; productDescription?: string }): void {
    this.productForm.patchValue({
      productSegment: prefill.productSegment || '',
      productDescription: prefill.productDescription || ''
    });
    this.matchPrefillCategory(prefill.productCategoryName);
  }

  private matchPrefillCategory(productCategoryName?: string): void {
    if (!productCategoryName) {
      return;
    }
    const categoryName = productCategoryName.trim().toLowerCase();
    const matchedCategory = this.categories.find(
      (category) => (category.categoryName || '').trim().toLowerCase() === categoryName
    );
    if (matchedCategory) {
      this.productForm.patchValue({ productCategory: matchedCategory._id });
    }
  }

  private patchFormForEdit(product: any): void {
    const createdByName = product?.createdBy
      ? `${product.createdBy.firstName || ''} ${product.createdBy.lastName || ''}`.trim()
      : '';
    this.createdByDisplay.setValue(createdByName);

    this.productForm.patchValue({
      partNo: product.partNo || '',
      itemCode: product.itemCode || '',
      createdDate: product.createdDate ? new Date(product.createdDate).toISOString().split('T')[0] : '',
      productDescription: product.productDescription || '',
      productSegment: product.productSegment?._id || product.productSegment || '',
      productCategory: product.productCategory?._id || product.productCategory || '',
      warehouse: product.warehouse?._id || product.warehouse || ''
    });

    this.productForm.get('itemCode')?.disable();
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
          this.productForm.patchValue({ productCategory: selectedId });
        } else if (!this.isEditMode && this.data?.prefill?.productCategoryName) {
          this.matchPrefillCategory(this.data.prefill.productCategoryName);
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
          this.productForm.patchValue({ warehouse: selectedId });
        }
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      }
    });
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

  onSubmit(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.productForm.getRawValue();

    if (this.isEditMode) {
      this.productService.updateProduct(this.data.product._id, formValue).subscribe({
        next: (product) => {
          this.toastr.success('Product updated successfully');
          this.dialogRef.close(product);
        },
        error: (error) => {
          this.toastr.error(error.error?.message || 'Failed to update product');
          this.isSubmitting = false;
        }
      });
      return;
    }

    this.productService.createProduct(formValue).subscribe({
      next: (product) => {
        this.toastr.success('Product created successfully');
        this.dialogRef.close(product);
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to create product');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}

