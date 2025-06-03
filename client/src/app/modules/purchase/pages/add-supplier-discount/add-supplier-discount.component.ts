import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';

@Component({
  selector: 'app-add-supplier-discount',
  imports: [
    CommonModule,
    NgIcon,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent
  ],
  templateUrl: './add-supplier-discount.component.html',
  styleUrl: './add-supplier-discount.component.css'
})
export class AddSupplierDiscountComponent implements OnInit {

  private fb = inject(FormBuilder)
  private toaster = inject(ToastrService)
  private supplierService = inject(SupplierService)
  isSubmitted = signal<boolean>(false);
  suppliers = signal<any[]>([])

  supplierForm: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    discount: ['', [Validators.required]],
    // discountType: ['', [Validators.required]]
  })

  discountTypes = [
    { id: 'Flat', name: 'Flat' },
    { id: 'Percentage', name: 'Percentage' },
  ];

  constructor(private dialogRef: MatDialogRef<AddSupplierDiscountComponent>) { }

  ngOnInit(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliers.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

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
