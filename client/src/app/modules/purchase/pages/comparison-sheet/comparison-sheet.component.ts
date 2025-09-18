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
import { ToastrService } from 'ngx-toastr';

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
  private toaster = inject(ToastrService)

  isSubmitted = signal<boolean>(false);
  selectedJob = signal<PurchaseData | null>(null)
  selectedItemId = signal<string | null>(null)
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
          
          this.selectedItemId.set(data.selectedItem);

          const item = this.getItem().find((item: QuoteItemDetails) => item._id === this.selectedItemId())
          if (item.comparisons) {
            this.comparisonList.set(item.comparisons)
          }
        } else {
          this.navigate()
        }
      },
      error: (error) => {
        console.log(error);
      }
    })
  }

  onSubmit() {
    const data = this.selectedJob()
    const selected = this.comparisonList().some(item => item.selected);

    if (!selected && this.comparisonList().length > 0) {
      this.toaster.error('Please select one comparison!');
      return;
    }

    if (data) {
      data.items = this.updateComparisonList();
      this.purchaseService.setPurchaseFormData(data)
      this.navigate()
    }
  }

  onClose() {
    this.purchaseService.setPurchaseFormData(this.selectedJob())
    this.navigate()
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
    const item = this.getItem().find((item: QuoteItemDetails) => item._id === this.selectedItemId())
    if (item) {
      return `Product: ${item.detail} \n Qty: ${item.quantity} \n Unit Cost: ₹${item.unitCost}`
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
      width: '500px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false
    })

    dialog.afterClosed().subscribe((res) => {
      if (res) {
        if(this.comparisonList().length == 0) res.selected = true
        this.comparisonList().push(res)
        this.comparisonList().sort((a, b) => a.unitPrice - b.unitPrice)
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

  navigate() {
    this.purchaseService.editMode$.subscribe((isEdit) => {
      if (isEdit) {
        this.purchaseService.purchaseId$.subscribe((id) => {
          if (id) {
            this.router.navigate(['/purchase/edit', id]);
          }
        })
      } else {
        this.router.navigate(['/purchase/create']);
      }
    })
  }

  onDeleteComparison(index: number) {
    this.comparisonList().splice(index, 1)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
