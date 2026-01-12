import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-add-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent
  ],
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.css'
})
export class AddCategoryComponent {
  private fb = inject(FormBuilder);
  private productCategoryService = inject(ProductCategoryService);
  private toastr = inject(ToastrService);
  isSubmitting = false;

  categoryForm: FormGroup = this.fb.group({
    categoryName: ['', [Validators.required]],
    createdDate: [new Date(), [Validators.required]]
  });

  constructor(
    public dialogRef: MatDialogRef<AddCategoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  onSubmit(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.productCategoryService.createProductCategory(this.categoryForm.value).subscribe({
      next: (category) => {
        this.toastr.success('Category created successfully');
        this.dialogRef.close(category);
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to create category');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}


