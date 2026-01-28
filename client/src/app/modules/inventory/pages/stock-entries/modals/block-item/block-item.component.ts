import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StockEntryService } from 'src/app/core/services/stock-entry/stock-entry.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { getCustomer } from 'src/app/shared/interfaces/customer.interface';

@Component({
  selector: 'app-block-item',
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
  templateUrl: './block-item.component.html',
  styleUrl: './block-item.component.css'
})
export class BlockItemComponent implements OnInit {
  private fb = inject(FormBuilder);
  private stockEntryService = inject(StockEntryService);
  private employeeService = inject(EmployeeService);
  private customerService = inject(CustomerService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private dialogRef = inject(MatDialogRef<BlockItemComponent>);
  private data = inject(MAT_DIALOG_DATA);

  isSubmitting = false;
  isLoadingAvailableQuantity = false;
  availableQuantity = 0;
  salesPersonName = '';
  customers: getCustomer[] = [];

  blockForm: FormGroup = this.fb.group({
    salesPersonName: ['', [Validators.required]],
    customerId: ['', [Validators.required]],
    availableQuantity: [0],
    quantity: ['', [Validators.required, Validators.min(1)]],
    fromDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    toDate: ['', [Validators.required]]
  });

  ngOnInit(): void {
    this.loadSalesPersonName();
    this.loadAvailableQuantity();
    this.loadCustomers();
    this.blockForm.get('availableQuantity')?.disable();
  }

  loadSalesPersonName(): void {
    this.employeeService.employeeData$.subscribe({
      next: (employee) => {
        if (employee) {
          this.salesPersonName = `${employee.firstName} ${employee.lastName}`;
          this.blockForm.patchValue({ salesPersonName: this.salesPersonName });
        }
      },
      error: () => {
        this.toastr.error('Failed to load employee data');
      }
    });
  }

  loadAvailableQuantity(): void {
    if (!this.data?.stockEntryId) {
      this.toastr.error('Invalid stock entry');
      this.dialogRef.close();
      return;
    }

    this.isLoadingAvailableQuantity = true;
    this.stockEntryService.getAvailableQuantity(this.data.stockEntryId).subscribe({
      next: (response) => {
        if (response.success) {
          this.availableQuantity = response.data.availableQuantity;
          this.blockForm.patchValue({ availableQuantity: this.availableQuantity });
          
          if (this.availableQuantity <= 0) {
            this.toastr.warning('No available quantity to block');
            this.dialogRef.close();
          }
        }
        this.isLoadingAvailableQuantity = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to load available quantity');
        this.isLoadingAvailableQuantity = false;
      }
    });
  }

  loadCustomers(): void {
    this.employeeService.employeeData$.subscribe({
      next: (employee) => {
        if (employee?._id) {
          this.customerService.getAllCustomers(employee._id).subscribe({
            next: (customers) => {
              this.customers = customers || [];
            },
            error: () => {
              this.toastr.error('Failed to load customers');
            }
          });
        }
      },
      error: () => {
        this.toastr.error('Failed to load employee data');
      }
    });
  }

  onQuantityChange(): void {
    const quantity = this.blockForm.get('quantity')?.value;
    if (quantity && quantity > this.availableQuantity) {
      this.blockForm.get('quantity')?.setErrors({ max: true });
      this.toastr.warning(`Maximum available quantity is ${this.availableQuantity}`);
    }
  }

  onSubmit(): void {
    if (this.blockForm.invalid) {
      this.blockForm.markAllAsTouched();
      return;
    }

    const formValue = this.blockForm.value;
    const quantity = parseFloat(formValue.quantity);

    if (quantity > this.availableQuantity) {
      this.toastr.error(`Cannot block more than available quantity (${this.availableQuantity})`);
      return;
    }

    const fromDate = new Date(formValue.fromDate);
    const toDate = new Date(formValue.toDate);

    if (toDate < fromDate) {
      this.toastr.error('To Date cannot be before From Date');
      return;
    }

    const selectedCustomer = this.customers.find(c => c._id === formValue.customerId);
    if (!selectedCustomer) {
      this.toastr.error('Please select a valid customer');
      return;
    }

    this.isSubmitting = true;
    const payload = {
      stockEntryId: this.data.stockEntryId,
      salesPersonName: formValue.salesPersonName.trim(),
      customerId: selectedCustomer._id,
      customerName: selectedCustomer.companyName,
      quantity: quantity,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString()
    };

    this.stockEntryService.createStockBlock(payload).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Item blocked successfully');
          this.dialogRef.close(true);
        }
        this.isSubmitting = false;
      },
      error: (error) => {
        this.toastr.error(error.error?.message || 'Failed to block item');
        this.isSubmitting = false;
      }
    });
  }

  createCustomer(): void {
    this.dialogRef.close();
    this.router.navigate(['/customers/create']);
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
