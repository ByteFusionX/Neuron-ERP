import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';

@Component({
  selector: 'app-comparison-form',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    IconsModule,
    SelectDropdownComponent
  ],
  templateUrl: './comparison-form.component.html',
  styleUrl: './comparison-form.component.css'
})
export class ComparisonFormComponent implements OnInit {

  private fb = inject(FormBuilder)
  private dialogRef = inject(MatDialogRef<ComparisonFormComponent>)
  private supplierService = inject(SupplierService)
  private toaster = inject(ToastrService)

  isSubmitted = signal<boolean>(false);
  suppliers = signal<any[]>([])

  comparisonForm: FormGroup = this.fb.group({
    supplierName: [''],
    supplierId: [''],
    qty: [null, Validators.required],
    unitCost: [null, Validators.required],
    etaTerms: ['', Validators.required],
    paymentTerms: ['', Validators.required],
    totalCost: [''],
    selected: [false]
  });

  constructor() {
    this.setupAutoTotalCostCalculation();
  }

  ngOnInit(): void {
    this.supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliers.set(res.data)
      }, error: (error) => {
        console.log(error);
      }
    })
  }

  setupAutoTotalCostCalculation() {
    this.comparisonForm.get('qty')?.valueChanges.subscribe(() => this.updateTotalCost());
    this.comparisonForm.get('unitCost')?.valueChanges.subscribe(() => this.updateTotalCost());
  }

  updateTotalCost() {
    const qty = this.comparisonForm.get('qty')?.value || 0;
    const unitCost = this.comparisonForm.get('unitCost')?.value || 0;
    const total = qty * unitCost;
    this.comparisonForm.get('totalCost')?.setValue(total.toFixed(2), { emitEvent: false });
  }

  onSubmit() {
    if (this.comparisonForm.invalid) {
      this.toaster.warning('Please fill all required fields')
      return;
    } else {
      const supplierId = this.comparisonForm.value.supplierId;
      const supplier = this.suppliers().find((item) => supplierId == item._id)
      this.comparisonForm.patchValue({ supplierName: supplier.supplierName })
      const data = this.comparisonForm.value
      this.dialogRef.close(data)
    }
  }

  onCancel() {
    this.comparisonForm.reset();
    this.dialogRef.close()
  }

  get f() {
    return this.comparisonForm.controls;
  }

}
