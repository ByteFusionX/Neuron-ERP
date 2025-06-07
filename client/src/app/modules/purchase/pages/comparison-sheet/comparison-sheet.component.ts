import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { PurchaseData, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';

@Component({
  selector: 'app-comparison-sheet',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.css'
})
export class ComparisonSheetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private purchaseService = inject(PurchaseService)
  private router = inject(Router)

  isSubmitted = signal<boolean>(false);
  selectedJob = signal<PurchaseData | null>(null)
  selectedItem = signal<QuoteItemDetails | null>(null)

  comparisonForm: FormGroup = this.fb.group({
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    product: [''],
    inventoryList: [[]],
  })

  ngOnInit(): void {
    this.purchaseService.purchaseFormData$.subscribe((job: any) => {
      if (job) {
        this.selectedJob.set(job)
      }
    })

    this.purchaseService.comparisonFormData$.subscribe({
      next: (data) => {
        console.log(data)
        this.comparisonForm.patchValue({
          purchaseNo: data.purchaseNo,
          jobId: data.jobId,
          product: data.item
        })
      },
      error: (error) => {
        console.log(error);
      }
    })
  }

  onSubmit() { }

  onClose() {
    this.router.navigate(['/purchase/create'])
  }

  get f() {
    return this.comparisonForm.controls;
  }

  getFormattedProducts(): string {
    const product = this.f['product'].value;
    if(product){
      return  `Product: ${product.detail} \n Qty: ${product.quantity} \n Unit Cost: ₹${product.unitCost}`
    }
    return '';
  }


  ngOnDestroy(): void {
    if (this.selectedJob()) {
      this.purchaseService.setPurchaseFormData(this.selectedJob())
    }
  }
}
