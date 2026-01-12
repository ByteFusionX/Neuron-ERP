import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-add-warehouse',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent
  ],
  templateUrl: './add-warehouse.component.html',
  styleUrl: './add-warehouse.component.css'
})
export class AddWarehouseComponent {
  private fb = inject(FormBuilder);
  private warehouseService = inject(WarehouseService);
  private toastr = inject(ToastrService);
  isSubmitting = false;

  warehouseForm: FormGroup = this.fb.group({
    wareHouseName: ['', [Validators.required]],
    createdDate: [new Date(), [Validators.required]]
  });

  constructor(
    public dialogRef: MatDialogRef<AddWarehouseComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  onSubmit(): void {
    if (this.warehouseForm.invalid) {
      this.warehouseForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.warehouseService.createWarehouse(this.warehouseForm.value).subscribe({
      next: (warehouse) => {
        this.toastr.success('Warehouse created successfully');
        this.dialogRef.close(warehouse);
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to create warehouse');
        this.isSubmitting = false;
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}


