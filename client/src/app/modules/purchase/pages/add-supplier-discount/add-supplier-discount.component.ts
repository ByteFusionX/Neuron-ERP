import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';

@Component({
  selector: 'app-add-supplier-discount',
  imports: [
    CommonModule,
    NgIcon,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent
  ],
  templateUrl: './add-supplier-discount.component.html',
  styleUrl: './add-supplier-discount.component.css'
})
export class AddSupplierDiscountComponent {

  private fb = inject(FormBuilder)
  isSubmitted = signal<boolean>(false);

  supplierForm: FormGroup = this.fb.group({
    supplier: ['', [Validators.required]],
    discount: ['', [Validators.required]]
  })

  constructor(private dialogRef: MatDialogRef<AddSupplierDiscountComponent>) { }
  onCloseClicks() {
    this.dialogRef.close({})
  }

  onSubmit() {
    this.dialogRef.close({ supplier: this.supplierForm.value })
  }

  get f() {
    return this.supplierForm.controls;
  }
}
