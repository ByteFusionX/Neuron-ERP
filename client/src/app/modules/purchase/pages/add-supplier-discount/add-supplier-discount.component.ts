import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { RadioGroupComponent } from 'src/app/shared/components/forms/radio-group/radio-group.component';

@Component({
  selector: 'app-add-supplier-discount',
  imports: [
    CommonModule,
    NgIcon,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    RadioGroupComponent
  ],
  templateUrl: './add-supplier-discount.component.html',
  styleUrl: './add-supplier-discount.component.css'
})
export class AddSupplierDiscountComponent {

  private fb = inject(FormBuilder)
  private toaster = inject(ToastrService)
  isSubmitted = signal<boolean>(false);

  supplierForm: FormGroup = this.fb.group({
    supplier: ['', [Validators.required]],
    discount: ['', [Validators.required]],
    // discountType: ['', [Validators.required]]
  })

  discountTypes = [
    { id: 'Flat', name: 'Flat' },
    { id: 'Percentage', name: 'Percentage' },
  ];

  constructor(private dialogRef: MatDialogRef<AddSupplierDiscountComponent>) { }
  onCloseClicks() {
    this.dialogRef.close()
  }

  onSubmit() {
    if (this.supplierForm.invalid) {
      this.toaster.warning("Please fill all required fields correctly")
    } else {
      this.dialogRef.close(this.supplierForm.value)
    }
  }

  get f() {
    return this.supplierForm.controls;
  }
}
