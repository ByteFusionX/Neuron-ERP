import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { PurchaseData, QuoteItem, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';
import { ComparisonFormComponent } from '../comparison-form/comparison-form.component';
import { Subscription } from 'rxjs';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-comparison-sheet',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    IconsModule
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.css'
})
export class ComparisonSheetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private purchaseService = inject(PurchaseService)
  private router = inject(Router)
  private _dialog = inject(MatDialog)
  private subscriptions = new Subscription()

  isSubmitted = signal<boolean>(false);
  selectedJob = signal<PurchaseData | null>(null)
  selectedItem = signal<QuoteItemDetails | null>(null)
  comparisonList = signal<any[]>([])

  comparisonForm: FormGroup = this.fb.group({
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    product: [''],
    inventoryList: [[]],
  })

  ngOnInit(): void {
    this.subscriptions.add(
      this.purchaseService.purchaseFormData$.subscribe((job: any) => {
        if (job) {
          this.selectedJob.set(job)
        }
      })
    )

    this.purchaseService.comparisonFormData$.subscribe({
      next: (data) => {
        if (data) {
          this.comparisonForm.patchValue({
            purchaseNo: data.purchaseNo,
            jobId: data.jobId,
            product: data.item
          })

          const item = this.getItem()
          if (item[0].comparisons) {
            this.comparisonList.set(item[0].comparisons)
          }
        } else {
          this.router.navigate(['/purchase/create'])
        }
      },
      error: (error) => {
        console.log(error);
      }
    })
  }

  onSubmit() {
    const data = this.selectedJob()
    if (data) {
      data.items = this.updateComparisonList();
      this.purchaseService.setPurchaseFormData(data)
      this.router.navigate(['/purchase/create'])
    }
  }

  onClose() {
    this.purchaseService.setPurchaseFormData(this.selectedJob())
    this.router.navigate(['/purchase/create'])
  }

  get f() {
    return this.comparisonForm.controls;
  }

  updateComparisonList(): QuoteItem[] {
    const product = this.f['product'].value;
    return product.map((data: QuoteItem) => {
      const updatedItemDetails = data.itemDetails.map(item => {
        if (item.comparison) {
          return {
            ...item,
            comparison: false,
            comparisons: [...this.comparisonList()]
          };
        }
        return { ...item };
      });

      return {
        ...data,
        itemDetails: updatedItemDetails
      };
    });
  }

  getFormattedProducts(): string {
    const item = this.getItem()
    if (item) {
      return `Product: ${item[0].detail} \n Qty: ${item[0].quantity} \n Unit Cost: ₹${item[0].unitCost}`
    }
    return '';
  }

  getItem() {
    const product = this.f['product'].value;
    return product.flatMap((data: QuoteItem) =>
      data.itemDetails.filter(item => item.comparison)
    );
  }

  onComparisonClicks() {
    const dialog = this._dialog.open(ComparisonFormComponent, {
      width: '500px'
    })

    dialog.afterClosed().subscribe((res) => {
      if (res) {
        this.comparisonList().push(res)
        this.comparisonList().sort((a, b) => a.unitCost - b.unitCost)
      }
    })
  }

  onSelectionChange(index: number): void {
    const comparisonList = this.comparisonList().map((item, i) => ({
      ...item,
      selected: i === index
    }));
    this.comparisonList.set(comparisonList)
  }

  onAddSupplier() {
    this.router.navigate(['/suppliers/create']);
  }

  onDeleteComparison(index: number) {
    this.comparisonList().splice(index, 1)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
