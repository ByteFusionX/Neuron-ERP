import { Component, Inject, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
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

  departments: getDepartment[] = [];
  categories: any[] = [];
  warehouses: any[] = [];

  productForm: FormGroup = this.fb.group({
    partNo: ['', [Validators.required]],
    createdDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    productDescription: ['', [Validators.required]],
    productSegment: ['', [Validators.required]],
    productCategory: ['', [Validators.required]],
    warehouse: ['', [Validators.required]]
  });

  constructor(
    public dialogRef: MatDialogRef<CreateProductComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  ngOnInit(): void {
    this.loadDepartments();
    this.loadCategories();
    this.loadWarehouses();
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
    this.productService.createProduct(this.productForm.value).subscribe({
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

