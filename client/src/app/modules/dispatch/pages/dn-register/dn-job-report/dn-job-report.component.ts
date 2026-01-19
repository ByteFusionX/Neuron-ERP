
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { JobService } from 'src/app/core/services/job/job.service';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { DeliveryNote } from 'src/app/shared/interfaces/delivery-note.interface';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';

@Component({
    selector: 'app-dn-job-report',
    standalone: true,
    imports: [CommonModule, MatDialogModule, NgIconComponent, SkeltonLoadingComponent],
    templateUrl: './dn-job-report.component.html',
    providers: [provideIcons({ heroXMark })]
})
export class DnJobReportComponent implements OnInit {

    isLoading: boolean = true;
    jobDetails: getJob | undefined;
    deliveryNotes: DeliveryNote[] = [];

    reportItems: any[] = [];

    constructor(
        private dialogRef: MatDialogRef<DnJobReportComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { jobId: string }, // Expecting jobId ID or Object? "Job ID" usually means the string "J-101", but internal ID is safer.
        private _jobService: JobService,
        private _dnService: DeliveryNoteService
    ) { }

    ngOnInit() {
        if (this.data.jobId) {
            this.loadData();
        } else {
            // Handle no Job ID case? 
            this.isLoading = false;
        }
    }

    loadData() {
        this.isLoading = true;
        // 1. Get Job Details to find Ordered Items
        // Use getOneJob which returns array
        this._jobService.getOneJob(this.data.jobId).subscribe((jobs) => {
            if (jobs && jobs.length > 0) {
                this.jobDetails = jobs[0];

                // 2. Get All DNs for this Job
                this._dnService.getDnsByJobId(this.data.jobId).subscribe((dns) => {
                    this.deliveryNotes = dns;
                    this.calculateReport();
                    this.isLoading = false;
                });
            } else {
                this.isLoading = false;
            }
        });
    }

    calculateReport() {
        if (!this.jobDetails) return;

        // Extract items from Job (Deal Data preferred, else Optional Items)
        // Assuming dealData structure or optionalItems
        // Need to check specific structure in Quotation interface but I can infer or use 'any' for safety.
        let items: any[] = [];
        const quote = this.jobDetails.quotation;

        if (quote && quote.dealData && quote.dealData.updatedItems) {
            // Flatten deal items
            quote.dealData.updatedItems.forEach((grp: any) => {
                grp.itemDetails.forEach((detail: any) => {
                    if (detail.dealSelected) { // Only selected items for deal
                        items.push({
                            description: detail.detail, // or appropriate field
                            orderedQty: detail.quantity,
                            deliveredQty: 0,
                            pendingQty: detail.quantity, // Initial
                            partNo: detail.partNo || '', // If exists
                            itemId: detail._id // Assuming ID helps matching
                        });
                    }
                });
            });
        } else if (quote && quote.optionalItems) {
            // Fallback
            quote.optionalItems.forEach((opt: any) => { // Usually option[0] is selected?
                opt.items.forEach((grp: any) => {
                    grp.itemDetails.forEach((detail: any) => {
                        items.push({
                            description: detail.detail,
                            orderedQty: detail.quantity,
                            deliveredQty: 0,
                            pendingQty: detail.quantity,
                            itemId: detail._id
                        });
                    });
                });
            });
        }

        // Now sum delivered quantity from DNs
        this.deliveryNotes.forEach(dn => {
            if (dn.status !== 'Cancelled') {
                dn.items.forEach(dnItem => {
                    // Match with Job Item. 
                    // Dn Item has 'itemId'.
                    const jobItem = items.find(i => i.itemId === dnItem.itemId || i.description === dnItem.description);
                    if (jobItem) {
                        jobItem.deliveredQty = (jobItem.deliveredQty || 0) + dnItem.currentDeliveryQty;
                    }
                });
            }
        });

        // Calculate Pending
        items.forEach(item => {
            item.pendingQty = item.orderedQty - item.deliveredQty;
        });

        this.reportItems = items;
    }

    onClose() {
        this.dialogRef.close();
    }
}
