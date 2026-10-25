import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MatDialog } from '@angular/material/dialog';
import { GrnService } from 'src/app/core/services/grn/grn.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailViewBadge, DetailViewShellComponent, DetailViewStat, DetailViewTab } from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';
import { DetailSectionComponent } from 'src/app/shared/components/detail-panel/detail-section.component';
import { DetailFieldComponent } from 'src/app/shared/components/detail-panel/detail-field.component';
import { DetailDocumentsComponent } from 'src/app/shared/components/detail-panel/detail-documents.component';
import { DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { DetailTone } from 'src/app/shared/components/detail-panel/detail-tone';

type Fact = { label: string; value: string; tone?: DetailTone | null };

@Component({
  selector: 'app-view-grn',
  standalone: true,
  imports: [
    CommonModule,
    IconsModule,
    FormsModule,
    SmartFormModule,
    ActionButtonComponent,
    DetailViewShellComponent,
    DetailSectionComponent,
    DetailFieldComponent,
    DetailDocumentsComponent,
  ],
  templateUrl: './view-grn.component.html',
  styleUrl: './view-grn.component.css'
})
export class ViewGrnComponent implements OnInit {
  private grnService = inject(GrnService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);

  grnId!: string;
  grn: any = null;
  isLoading = signal<boolean>(true);
  purchaseId: string = '';
  isGenerating = signal<boolean>(false);

  readonly tabs: DetailViewTab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'items', label: 'Items' },
    { id: 'documents', label: 'Documents' },
  ];
  tab = 'overview';

  headerTitle = '';
  headerSubtitle = '';
  avatarText = 'GRN';
  badges: DetailViewBadge[] = [];
  stats: DetailViewStat[] = [];
  overviewSections: { title: string; facts: Fact[] }[] = [];
  orderFacts: Fact[] = [];
  receiptFacts: Fact[] = [];
  docList: DetailDocument[] = [];
  private docFiles = new Map<string, any>();

  /** Where "Back" should land, when the caller passed one (e.g. the GRN list). */
  private returnUrl = '';

  ngOnInit(): void {
    this.grnId = <string>this.route.snapshot.paramMap.get('id');
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';

    if (!this.grnId) {
      this.toastr.error('Invalid GRN ID');
      this.navigateAway();
      return;
    }
    this.loadGRN();
  }

  loadGRN(): void {
    this.isLoading.set(true);
    this.grnService.getGRNById(this.grnId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.grn = response.data;
          this.purchaseId = this.grn.purchaseOrderId?._id || this.grn.purchaseOrderId || '';
          this.buildDetails();
          this.isLoading.set(false);
        } else {
          this.toastr.error('GRN not found');
          this.isLoading.set(false);
          this.purchaseId = this.purchaseId || response.data?.purchaseOrderId?._id || response.data?.purchaseOrderId || '';
          this.navigateAway();
        }
      },
      error: (error) => {
        this.toastr.error('Failed to load GRN details');
        console.error('Error loading GRN:', error);
        this.isLoading.set(false);
        this.purchaseId = this.purchaseId
          || this.grn?.purchaseOrderId?._id || this.grn?.purchaseOrderId
          || error?.error?.data?.purchaseOrderId?._id || error?.error?.data?.purchaseOrderId
          || '';
        this.navigateAway();
      }
    });
  }

  /** The shell takes new-array inputs, so everything it shows is built once per load. */
  private buildDetails(): void {
    const g = this.grn;
    const po = g?.purchaseOrderId;
    const supplier = po?.supplierId?.supplierName;
    const grnDate = this.formatDate(g?.grnDate);
    const rejected = this.getTotalRejectedQty();
    const outcome = g?.outcomeStatus || (rejected > 0 ? 'Return Required' : 'Completed');
    const invoice = g?.invoiceStatus || (rejected > 0 ? 'Blocked by Return' : 'Ready for Invoice');

    this.headerTitle = g?.grnNo || 'GRN';
    this.headerSubtitle = [supplier, po?.poNo ? 'LPO ' + po.poNo : '', grnDate].filter(Boolean).join('  •  ');
    this.badges = [
      { label: outcome, tone: rejected > 0 ? 'warn' : 'good' },
      { label: invoice, tone: rejected > 0 ? 'bad' : 'info' },
    ];
    this.stats = [
      { label: 'Ordered', value: String(this.getTotalOrderedQty()) },
      { label: 'Received', value: String(this.getTotalReceivedQty()) },
      { label: 'Accepted', value: String(this.getTotalAcceptedQty()) },
      { label: 'Rejected', value: String(rejected), danger: rejected > 0 },
    ];

    this.overviewSections = [
      {
        title: 'GRN details',
        facts: [
          { label: 'GRN No', value: g?.grnNo || 'N/A' },
          { label: 'GRN Date', value: grnDate },
          { label: 'Location / Warehouse', value: g?.warehouse?.wareHouseName || 'N/A' },
          { label: 'Received By', value: this.formatEmployeeName(g?.receivedBy) || 'N/A' },
          { label: 'Created By', value: this.formatEmployeeName(g?.createdBy) || 'N/A' },
          { label: 'Items', value: String(g?.items?.length || 0) },
        ],
      },
      {
        title: 'Supplier documents',
        facts: [
          { label: 'Supplier Invoice No.', value: g?.supplierInvoiceNo || 'N/A' },
          { label: 'Supplier Invoice Date', value: this.formatDate(g?.supplierInvoiceDate) },
          { label: 'Supplier Delivery Note No.', value: g?.supplierDeliveryNoteNo || 'N/A' },
        ],
      },
      {
        title: 'Outcome',
        facts: [
          { label: 'Outcome', value: outcome, tone: rejected > 0 ? 'warn' : 'good' },
          { label: 'Invoice', value: invoice, tone: rejected > 0 ? 'bad' : null },
          { label: 'Return Resolution', value: g?.returnResolution || 'N/A' },
        ],
      },
    ];

    this.orderFacts = [
      { label: 'LPO No', value: po?.poNo || 'N/A' },
      { label: 'Supplier', value: supplier || 'N/A' },
      { label: 'Job ID', value: g?.jobId?.jobId || po?.purchaseId?.jobId?.jobId || 'N/A' },
      { label: 'Customer', value: this.getCompanyName() || 'N/A' },
    ];
    this.receiptFacts = [
      { label: 'GRN Date', value: grnDate },
      { label: 'Warehouse', value: g?.warehouse?.wareHouseName || 'N/A' },
      { label: 'Received By', value: this.formatEmployeeName(g?.receivedBy) || 'N/A' },
    ];

    this.docList = [];
    this.docFiles.clear();
    const addDocs = (files: any[] | undefined, source: string) => (files || []).forEach((f: any, i: number) => {
      const id = `${source}-${i}`;
      this.docFiles.set(id, f);
      this.docList.push({ id, name: f.originalname || f.fileName || f.name || 'File', uploadedBy: source });
    });
    addDocs(g?.supplierInvoices, 'Supplier invoice');
    addDocs(g?.supplierDeliveryNotes, 'Delivery note');
  }

  openDocument(doc: DetailDocument): void {
    const file = this.docFiles.get(doc.id);
    if (!file) return;
    const modalData: FileUploadModalData = {
      title: `${doc.uploadedBy} - ${doc.name}`,
      existingFiles: [file],
      allowMultiple: true,
      showActions: { upload: false, download: true, view: true, delete: false },
    };
    this.dialog.open(FileUploadModalComponent, { data: modalData, width: '800px', maxHeight: '90vh' });
  }

  private navigateAway(): void {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
    } else if (this.purchaseId) {
      this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
    } else {
      this.router.navigate(['/purchase/approves']);
    }
  }

  onBack(): void {
    this.navigateAway();
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) return partNo.partNo;
    return '-';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return '';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    if (employee.firstName) return employee.firstName;
    if (employee.lastName) return employee.lastName;
    return '';
  }

  getRejectedQty(item: any): number {
    if (item?.rejectedQty !== undefined && item?.rejectedQty !== null) {
      return item.rejectedQty;
    }
    return Math.max(0, (item?.receivedQty || 0) - (item?.acceptedQty || 0));
  }

  private sumItems(selector: (item: any) => number): number {
    if (!this.grn?.items || !Array.isArray(this.grn.items)) return 0;
    return this.grn.items.reduce((sum: number, item: any) => sum + (selector(item) || 0), 0);
  }

  getTotalOrderedQty(): number {
    return this.sumItems(item => item.orderedQty);
  }

  getTotalReceivedQty(): number {
    return this.sumItems(item => item.receivedQty);
  }

  getTotalAcceptedQty(): number {
    return this.sumItems(item => item.acceptedQty);
  }

  getTotalRejectedQty(): number {
    return this.sumItems(item => this.getRejectedQty(item));
  }

  onViewReceipt(): void {
    const items = this.grn?.items || [];
    if (!items.length) {
      this.toastr.warning('No items recorded on this GRN');
      return;
    }

    this.isGenerating.set(true);
    this.grnService.generateGRNReceiptPDF(this.grn, items).then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        this.isGenerating.set(false);
        this.dialog.open(PdfPreviewComponent, {
          data: { url: url, formatedQuote: this.grn, type: 'grn' }
        });
      });
    }).catch((error) => {
      console.error('Error generating PDF:', error);
      this.toastr.error('Failed to load GRN receipt');
      this.isGenerating.set(false);
    });
  }

  getCompanyName(): string {
    if (!this.grn) return '';
    return this.grn.purchaseOrderId?.purchaseId?.customerId?.companyName ||
           this.grn.purchaseOrderId?.quoteId?.client?.companyName ||
           this.grn.purchaseOrderId?.purchaseId?.jobId?.quoteId?.client?.companyName ||
           '';
  }
}
