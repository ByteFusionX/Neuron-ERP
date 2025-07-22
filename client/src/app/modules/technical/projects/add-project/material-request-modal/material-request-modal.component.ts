import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;
  remarks: string;
}

@Component({
  selector: 'app-material-request-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IconsModule,
    ButtonComponent
  ],
  templateUrl: './material-request-modal.component.html',
  styleUrl: './material-request-modal.component.css'
})
export class MaterialRequestModalComponent implements OnInit {
  private fb = inject(FormBuilder);
  
  materialForm: FormGroup;
  isSubmitted = false;

  constructor(
    public dialogRef: MatDialogRef<MaterialRequestModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { materialRequests: MaterialRequest[] }
  ) {
    this.materialForm = this.fb.group({
      materialRequests: this.fb.array([])
    });
  }

  ngOnInit(): void {
    if (this.data?.materialRequests?.length > 0) {
      this.data.materialRequests.forEach(item => {
        this.addMaterialRequest(item);
      });
    } else {
      this.addMaterialRequest();
    }
  }

  get materialRequestsArray() {
    return this.materialForm.get('materialRequests') as FormArray;
  }

  addMaterialRequest(item?: MaterialRequest): void {
    let formattedDate = '';
    if (item?.requiredOn) {
      const date = new Date(item.requiredOn);
      formattedDate = date.toISOString().split('T')[0];
    }

    const materialRequest = this.fb.group({
      itemName: [item?.itemName || '', [Validators.required]],
      quantity: [item?.quantity || 1, [Validators.required, Validators.min(1)]],
      estimatedCost: [item?.estimatedCost || 0, [Validators.required, Validators.min(0)]],
      requiredOn: [formattedDate, [Validators.required]],
      remarks: [item?.remarks || '']
    });

    this.materialRequestsArray.push(materialRequest);
  }

  removeMaterialRequest(index: number): void {
    if (this.materialRequestsArray.length > 1) {
      this.materialRequestsArray.removeAt(index);
    }
  }

  calculateTotalCost(quantity: number, estimatedCost: number): number {
    return quantity * estimatedCost;
  }

  calculateGrandTotal(): number {
    let total = 0;
    this.materialRequestsArray.controls.forEach(control => {
      const quantity = control.get('quantity')?.value || 0;
      const estimatedCost = control.get('estimatedCost')?.value || 0;
      total += quantity * estimatedCost;
    });
    return total;
  }

  onSubmit(): void {
    this.isSubmitted = true;
    
    if (this.materialForm.invalid) {
      return;
    }

    const materialRequests = this.materialForm.value.materialRequests.map((item: any) => ({
      ...item,
      requiredOn: new Date(item.requiredOn)
    }));

    this.dialogRef.close(materialRequests);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getFieldError(control: any, fieldName: string): string {
    if (control?.errors && control?.touched) {
      if (control.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
      if (control.errors['min']) {
        return `${this.getFieldLabel(fieldName)} must be greater than ${control.errors['min'].min}`;
      }
    }
    return '';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      itemName: 'Item Name',
      quantity: 'Quantity',
      estimatedCost: 'Estimated Cost',
      requiredOn: 'Required On',
      remarks: 'Remarks'
    };
    return labels[fieldName] || fieldName;
  }
} 