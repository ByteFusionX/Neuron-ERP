import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ToastrService } from 'ngx-toastr';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule, SfOption } from 'src/app/shared/components/smart-form';

export interface MrRequestModalData {
  purchaseId: string;
}

@Component({
  selector: 'app-mr-request',
  imports: [CommonModule, ReactiveFormsModule, SmartFormModule, DetailPanelIconComponent, DetailBadgeComponent, ActionButtonComponent],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private purchaseService = inject(PurchaseService);
  private modalRef = inject<ModalRef<{ success: boolean }>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as MrRequestModalData | null;

  employeeOptions: SfOption[] = [];
  purchaseId = this.data?.purchaseId || '';
  hasMrRequest = signal<boolean>(false);
  isSaving = signal<boolean>(false);

  mrForm: FormGroup = this.fb.group({
    engineer: ['', [Validators.required]],
    message: ['', [Validators.required]],
    totalPurchase: [0]
  })

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
        this.employeeOptions = employees.map((emp) => ({ label: `${emp.firstName} ${emp.lastName}`, value: emp._id }));
      },
      error: (error) => {
        this.toaster.error('Failed to load employees');
        console.error('Error loading employees:', error);
      }
    });
  }

  onCloseClicks() {
    this.modalRef.close()
  }

  onSubmit() {
    if (this.mrForm.invalid) {
      this.mrForm.markAllAsTouched();
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

    this.isSaving.set(true);
    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.success) {
          this.hasMrRequest.set(true);
          this.toaster.success('MR request updated successfully');
          this.modalRef.close({ success: true });
        }
      },
      error: (error) => {
        this.isSaving.set(false);
        console.error('Error updating MR request:', error);
        this.toaster.error('Failed to update MR request');
      }
    });
  }

  onClearClicks() {
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

    this.isSaving.set(true);
    this.purchaseService.updatePurchaseMrRequest(this.purchaseId, mrRequest).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.success) {
          this.toaster.success('MR request cleared successfully');
          this.hasMrRequest.set(false);
          this.mrForm.reset();
          this.modalRef.close({ success: true });
        }
      },
      error: (error) => {
        this.isSaving.set(false);
        console.error('Error clearing MR request:', error);
        this.toaster.error('Failed to clear MR request');
      }
    });
  }

  get f() {
    return this.mrForm.controls;
  }
}
