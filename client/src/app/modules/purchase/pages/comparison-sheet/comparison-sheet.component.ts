import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';

@Component({
  selector: 'app-comparison-sheet',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.css'
})
export class ComparisonSheetComponent implements OnInit {
  private fb = inject(FormBuilder);
  private purchaseService = inject(PurchaseService)

  isSubmitted = signal<boolean>(false);
  selectedJob = signal<getJob | null>(null)

  comparisonForm: FormGroup = this.fb.group({
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    product: ['', [Validators.required]],
    inventoryList: [[], [Validators.required]],
  })

  ngOnInit(): void {
    this.purchaseService.selectedJob$.subscribe((job) => {
      if (job) {
        this.selectedJob.set(job)
        this.comparisonForm.patchValue({
          purchaseNo: job.purchaseNo,
          jobId: job.jobId
        })
      }
    })
  }

  onSubmit() { }

  get f() {
    return this.comparisonForm.controls;
  }
}
