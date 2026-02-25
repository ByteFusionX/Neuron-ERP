import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { InvoiceService } from 'src/app/core/services/invoice.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CancelReissueInvoiceComponent } from '../cancel-reissue-invoice/cancel-reissue-invoice.component';
import { Invoice } from 'src/app/shared/interfaces/invoice.interface';
import { convertNumberToWords } from 'src/app/shared/utils/number.utils';

@Component({
    selector: 'app-invoice-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        ButtonComponent,
        MatDialogModule
    ],
    templateUrl: './invoice-view.component.html'
})
export class InvoiceViewComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private invoiceService = inject(InvoiceService);
    private notificationService = inject(ToastrService);
    private dialog = inject(MatDialog);

    invoice = signal<any | null>(null);
    isLoading = signal<boolean>(true);
    amountInWords = signal<string>('');

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.loadInvoice(id);
        } else {
            this.notificationService.error('Invalid Invoice ID');
            this.router.navigate(['/invoice/invoice-register']);
        }
    }

    loadInvoice(id: string) {
        this.isLoading.set(true);
        this.invoiceService.getInvoiceById(id).subscribe({
            next: (res) => {
                if (res.success && res.data) {
                    this.invoice.set(res.data);
                    this.amountInWords.set(convertNumberToWords(res.data.amount) + ' QAR Only');
                } else {
                    this.notificationService.error('Invoice details not found');
                    this.router.navigate(['/invoice/invoice-register']);
                }
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error('Error fetching invoice', err);
                this.notificationService.error('Failed to load invoice details');
                this.isLoading.set(false);
                this.router.navigate(['/invoice/invoice-register']);
            }
        });
    }

    onEdit() {
        const currentInvoice = this.invoice();
        if (currentInvoice && currentInvoice._id) {
            this.router.navigate(['/invoice/invoice-register/edit', currentInvoice._id]);
        }
    }

    onCancelInvoice() {
        const currentInvoice = this.invoice();
        if (!currentInvoice) return;

        const dialogRef = this.dialog.open(CancelReissueInvoiceComponent, {
            width: '600px',
            data: { invoice: currentInvoice },
            disableClose: true
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (result.action === 'cancel') {
                    // Simulated success
                    this.notificationService.success('Invoice cancelled successfully (simulated)');
                    this.loadInvoice(currentInvoice._id); // Refresh data if handled externally, or update local status
                    this.invoice.set({ ...currentInvoice, status: 'Cancelled' }); // Update manually for now
                } else if (result.action === 'reissue') {
                    // Simulated success and navigation
                    this.notificationService.success('Invoice cancelled successfully. Proceeding to Re-Issue. (simulated)');
                    // Navigate to create page with pre-filled data using state
                    this.router.navigate(['/invoice/invoice-register/create'], { state: { reissuedFrom: currentInvoice } });
                }
            }
        });
    }

    onBack() {
        this.router.navigate(['/invoice/invoice-register']);
    }
}
