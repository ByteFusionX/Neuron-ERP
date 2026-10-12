import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';

export interface AllocatePurchaseData {
  purchaseNo?: string;
}

export interface AllocatePurchaseResult {
  employeeId: string;
}

@Component({
  selector: 'app-allocate-purchase-modal',
  standalone: true,
  imports: [CommonModule, SmartFormModule, FormModalShellComponent],
  templateUrl: './allocate-purchase-modal.component.html',
})
export class AllocatePurchaseModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject<ModalRef<AllocatePurchaseResult>>(ModalRef);
  private purchaseService = inject(PurchaseService);
  data = inject(MODAL_DATA, { optional: true }) as AllocatePurchaseData | null;

  employeeOptions: SfOption[] = [];
  submitted = false;
  form = this.fb.group({
    employee: [null as string | null, Validators.required],
  });

  ngOnInit(): void {
    this.purchaseService.getPurchaseAssignees().subscribe({
      next: (res) => {
        this.employeeOptions = (res?.data ?? []).map((employee: any) => ({
          value: employee._id,
          label: `${employee.firstName} ${employee.lastName}`,
          description: [employee.employeeId, employee.category?.categoryName, this.titleCase(employee.category?.role)]
            .filter(Boolean)
            .join(' · '),
        }));
      },
      error: (error) => console.error('Error loading employees:', error),
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const employeeId = this.form.controls.employee.value;
    if (!employeeId) return;
    this.dialogRef.close({ employeeId });
  }

  private titleCase(value?: string | null): string {
    if (!value) return '';
    return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
