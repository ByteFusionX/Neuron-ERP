import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { NgIconsModule } from '@ng-icons/core';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { Invoice } from 'src/app/shared/interfaces/invoice.interface';

export interface CancelReissueInvoiceData {
    invoice: any; // Using any or specific Invoice interface depending on availability
}

@Component({
    selector: 'app-cancel-reissue-invoice',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatDialogModule,
        DropdownModule,
        NgIconsModule,
        ModalLayoutComponent
    ],
    templateUrl: './cancel-reissue-invoice.component.html',
})
export class CancelReissueInvoiceComponent implements OnInit {
    form: FormGroup;
    invoiceData: any = null;

    // Options for dropdowns (currently just the single pre-filled values)
    jobOptions: { label: string; value: string }[] = [];
    invoiceOptions: { label: string; value: string }[] = [];

    constructor(
        private fb: FormBuilder,
        public dialogRef: MatDialogRef<CancelReissueInvoiceComponent>,
        @Inject(MAT_DIALOG_DATA) public data: CancelReissueInvoiceData
    ) {
        this.invoiceData = data.invoice;

        this.form = this.fb.group({
            jobId: [{ value: '', disabled: true }, Validators.required],
            invoiceNo: [{ value: '', disabled: true }, Validators.required],
            customerName: [{ value: '', disabled: true }],
            reason: ['', [Validators.required, Validators.minLength(5)]]
        });
    }

    ngOnInit(): void {
        if (this.invoiceData) {
            // Pre-fill dropdown options to include the current invoice's details
            const jobIdStr = typeof this.invoiceData.jobId === 'object' ? this.invoiceData.jobId?.jobId : this.invoiceData.jobId;
            const jobValue = typeof this.invoiceData.jobId === 'object' ? this.invoiceData.jobId?._id : this.invoiceData.jobId;
            const customerNameStr = typeof this.invoiceData.customer === 'object' ? this.invoiceData.customer?.companyName : 'N/A';

            this.jobOptions = [{ label: jobIdStr || 'Unknown', value: jobValue }];
            this.invoiceOptions = [{ label: this.invoiceData.invoiceNo, value: this.invoiceData._id }];

            this.form.patchValue({
                jobId: jobValue,
                invoiceNo: this.invoiceData._id,
                customerName: customerNameStr
            });
        }
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onCancelInvoice(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        // Simulate generic success as per user instruction not to touch backend
        this.dialogRef.close({
            action: 'cancel',
            reason: this.form.value.reason
        });
    }

    onCancelAndReissue(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        // Simulate generic success as per user instruction not to touch backend
        this.dialogRef.close({
            action: 'reissue',
            reason: this.form.value.reason,
            invoiceData: this.invoiceData
        });
    }
}
