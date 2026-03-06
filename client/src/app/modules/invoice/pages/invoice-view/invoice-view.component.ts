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
import { NgIconComponent } from '@ng-icons/core';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { DeliveryNoteService } from 'src/app/core/services/delivery-note/delivery-note.service';
import { JobService } from 'src/app/core/services/job/job.service';

@Component({
    selector: 'app-invoice-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        ButtonComponent,
        MatDialogModule,
        NgIconComponent
    ],
    templateUrl: './invoice-view.component.html'
})
export class InvoiceViewComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private invoiceService = inject(InvoiceService);
    private notificationService = inject(ToastrService);
    private dialog = inject(MatDialog);
    private dnService = inject(DeliveryNoteService);
    private jobService = inject(JobService);

    invoice = signal<any | null>(null);
    isLoading = signal<boolean>(true);
    amountInWords = signal<string>('');
    dnNumbers = signal<string>('');
    lpoRef = signal<string>('');
    subject = signal<string>('');
    salespersonName = signal<string>('');
    currency = signal<string>('QAR');

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
                    const cur = res.data.currency || 'QAR';
                    this.currency.set(cur);
                    this.amountInWords.set(convertNumberToWords(res.data.amount) + ` ${cur} Only`);
                    this.loadInvoiceMeta(res.data);
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
            if (!result) {
                return;
            }

            if (result.action === 'cancel') {
                this.invoiceService.cancelInvoice(currentInvoice._id, { reason: result.reason }).subscribe({
                    next: (res) => {
                        this.notificationService.success(res.message || 'Invoice cancelled successfully');
                        const updated = res.data || currentInvoice;
                        this.invoice.set(updated);
                        this.loadInvoice(currentInvoice._id);
                    },
                    error: (err) => {
                        console.error('Error cancelling invoice', err);
                        this.notificationService.error(err.error?.message || 'Failed to cancel invoice');
                    }
                });
            } else if (result.action === 'reissue') {
                this.invoiceService.cancelAndReissueInvoice(currentInvoice._id, { reason: result.reason }).subscribe({
                    next: (res) => {
                        this.notificationService.success(res.message || 'Invoice marked for reissue successfully');
                        const original = res.data?.originalInvoice || currentInvoice;
                        const reissueInvoiceNo = res.data?.reissueInvoiceNo;
                        this.invoice.set(original);
                        if (original && original._id) {
                            this.router.navigate(
                                ['/invoice/invoice-register/reissue', original._id],
                                { state: { reissueInvoiceNo } }
                            );
                        } else {
                            this.loadInvoice(currentInvoice._id);
                        }
                    },
                    error: (err) => {
                        console.error('Error cancelling and reissuing invoice', err);
                        this.notificationService.error(err.error?.message || 'Failed to cancel and reissue invoice');
                    }
                });
            }
        });
    }

    onBack() {
        this.router.navigate(['/invoice/invoice-register']);
    }

    async onPreview() {
        const currentInvoice = this.invoice();
        if (!currentInvoice) return;

        const enriched = {
            ...currentInvoice,
            dnNumbers: this.dnNumbers(),
            lpoRef: this.lpoRef(),
            subject: this.subject(),
            currency: this.currency()
        };

        try {
            const pdfDoc = await this.invoiceService.generateInvoicePDF(enriched);
            pdfDoc.getBlob((blob: Blob) => {
                const url = window.URL.createObjectURL(blob);
                this.dialog.open(PdfPreviewComponent, {
                    height: '90vh',
                    maxWidth: '1200px',
                    data: {
                        url: url,
                        formatedQuote: enriched,
                        type: 'invoice'
                    }
                });
            });
        } catch (error) {
            console.error('Error generating Invoice PDF:', error);
            this.notificationService.error('Failed to generate Invoice PDF preview');
        }
    }

    private loadInvoiceMeta(inv: any) {
        const jobId = (inv.jobId as any)?._id || inv.jobId;
        if (!jobId) {
            return;
        }

        const dnIdSet = new Set<string>();
        (inv.items || []).forEach((item: any) => {
            if (Array.isArray(item.dnRefs) && item.dnRefs.length > 0) {
                item.dnRefs.forEach((r: any) => {
                    if (r.dnId) {
                        dnIdSet.add(String(r.dnId));
                    }
                });
            } else if (item.dnId) {
                dnIdSet.add(String(item.dnId));
            }
        });

        this.dnService.getAllDeliveryNotes({ page: 1, row: 1000, jobId }).subscribe({
            next: (res) => {
                const dns = res.dns || [];
                const usedDns = dns.filter((d: any) => dnIdSet.has(String(d._id)));
                const dnNos = usedDns.map((d: any) => d.dnNo).filter(Boolean).join(', ');
                this.dnNumbers.set(dnNos);

                let lpo = usedDns[0]?.customerLpoNumber || '';
                if (!this.lpoRef()) {
                    this.lpoRef.set(lpo || this.lpoRef());
                }
            },
            error: () => {
                this.dnNumbers.set('');
            }
        });

        this.jobService.getOneJob(jobId).subscribe({
            next: (jobData: any) => {
                const job = Array.isArray(jobData) ? jobData[0] : jobData;
                const subj = job?.quotation?.subject || '';
                this.subject.set(subj);
                if (!this.lpoRef()) {
                    const lpo = job?.purchaseNo || job?.lpoNumber || '';
                    this.lpoRef.set(lpo);
                }
                const createdBy = job?.quotation?.createdBy;
                if (createdBy) {
                    const name = [createdBy.firstName, createdBy.lastName].filter(Boolean).join(' ');
                    this.salespersonName.set(name || '');
                } else {
                    this.salespersonName.set('');
                }
                const cur = job?.quotation?.currency;
                if (cur) {
                    this.currency.set(cur);
                }
            },
            error: () => {
                this.subject.set('');
                this.salespersonName.set('');
            }
        });
    }
}
