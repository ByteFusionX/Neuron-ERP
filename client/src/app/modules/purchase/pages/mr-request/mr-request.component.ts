import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';

@Component({
  selector: 'app-mr-request',
  imports: [
    NgIcon,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
  ],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private purchaseService = inject(PurchaseService);
  isSubmitted = signal<boolean>(false);
  employees: getEmployee[] = [];
  purchaseId!: string;
  hasMrRequest = signal<boolean>(false);

  mrForm: FormGroup = this.fb.group({
    engineer: ['', [Validators.required]],
    message: ['', [Validators.required]],
    totalPurchase: [0]
  })

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialogRef: MatDialogRef<MrRequestComponent>) {
    this.purchaseId = data.purchaseId || '';
  }

  ngOnInit(): void {
    this.loadEmployees();
    if (this.purchaseId) {
      this.loadPurchaseData();
    }
  }

  loadPurchaseData(): void {
    this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
      next: (res) => {
        if (res.data?.mrRequest?.engineer) {
          const mrRequest = res.data.mrRequest;
          this.hasMrRequest.set(true);
          this.mrForm.patchValue({
            engineer: typeof mrRequest.engineer === 'object' ? mrRequest.engineer._id : mrRequest.engineer || '',
            message: mrRequest.message || '',
            totalPurchase: mrRequest.totalPurchase || 0,
          });
        } else {
          this.hasMrRequest.set(false);
        }
      },
      error: (error) => {
        console.error('Error loading purchase data:', error);
        this.hasMrRequest.set(false);
      }
    });
  }

  loadEmployees(): void {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.employees = employees.map(emp => ({
          ...emp,
          fullName: `${emp.firstName} ${emp.lastName}`
        }));
      },
      error: (error) => {
        this.toaster.error('Failed to load employees');
        console.error('Error loading employees:', error);
      }
    });
  }

  onCloseClicks() {
    this.mrForm.reset()
    this.dialogRef.close()
  }

  onSubmit() {
    if (this.mrForm.invalid) {
      this.toaster.warning("Please fill all required fields correctly")
      return;
    }

    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const mrRequest = {
      engineer: this.mrForm.value.engineer,
      message: this.mrForm.value.message,
      totalPurchase: this.mrForm.value.totalPurchase || 0,
      createdDate: new Date()
    };
    

    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        if (res.success) {
          this.hasMrRequest.set(true);
          this.toaster.success('MR request updated successfully');
          this.dialogRef.close({ success: true });
        }
      },
      error: (error) => {
        console.error('Error updating MR request:', error);
        this.toaster.error('Failed to update MR request');
      }
    });
  }

  onClearClicks(){
    if (!this.purchaseId) {
      this.toaster.error('Purchase ID is required');
      return;
    }

    const mrRequest = {
      engineer: null,
      message: '',
      totalPurchase: 0,
      createdDate: new Date()
    };

    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        if (res.success) {
          this.toaster.success('MR request cleared successfully');
          this.hasMrRequest.set(false);
          this.mrForm.reset();
          this.dialogRef.close({ success: true });
        }
      },
      error: (error) => {
        console.error('Error clearing MR request:', error);
        this.toaster.error('Failed to clear MR request');
      }
    });
  }

  get f() {
    return this.mrForm.controls;
  }
}

