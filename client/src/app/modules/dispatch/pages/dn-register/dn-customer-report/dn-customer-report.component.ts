
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { DeliveryNote } from 'src/app/shared/interfaces/delivery-note.interface';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroXMark } from '@ng-icons/heroicons/outline';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';

@Component({
    selector: 'app-dn-customer-report',
    standalone: true,
    imports: [CommonModule, MatDialogModule, NgIconComponent, SkeltonLoadingComponent],
    templateUrl: './dn-customer-report.component.html',
    providers: [provideIcons({ heroXMark }), DatePipe]
})
export class DnCustomerReportComponent implements OnInit {

    isLoading: boolean = true;
    customerName: string = '';
    deliveryNotes: DeliveryNote[] = [];

    constructor(
        private dialogRef: MatDialogRef<DnCustomerReportComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { customer: string },
        private _dnService: DeliveryNoteService
    ) {
        this.customerName = data.customer;
    }

    ngOnInit() {
        if (this.customerName) {
            this.loadData();
        } else {
            this.isLoading = false;
        }
    }

    loadData() {
        this.isLoading = true;
        let filterData = {
            customer: this.customerName,
            row: 1000, // Fetch all reasonable amount
            page: 1
        };

        this._dnService.getAllDeliveryNotes(filterData).subscribe((data) => {
            if (data && data.dns) {
                this.deliveryNotes = data.dns;
            }
            this.isLoading = false;
        });
    }

    onClose() {
        this.dialogRef.close();
    }
}
