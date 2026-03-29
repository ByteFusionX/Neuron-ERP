import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-add-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    NgIcon
  ],
  templateUrl: './add-category.component.html',
  styleUrl: './add-category.component.css'
})
export class AddCategoryComponent {
  private fb = inject(FormBuilder);
  private productCategoryService = inject(ProductCategoryService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  isSubmitting = false;

  categoryForm: FormGroup = this.fb.group({
    categoryName: ['', [Validators.required]],
    createdDate: [new Date(), [Validators.required]]
  });

  onSubmit(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.productCategoryService.createProductCategory(this.categoryForm.value).subscribe({
      next: (category) => {
        this.toastr.success('Category created successfully');
        this.router.navigate(['/inventory/products']);
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to create category');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/inventory/products']);
  }
}


