import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import {
  DocumentSettings,
  QuotationTemplateSettings,
  SystemSettingService,
} from 'src/app/core/services/system-setting.service';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridRowAction,
  DataGridRowActionEvent,
} from 'src/app/shared/components/data-grid/data-grid.model';

interface DocumentSettingsRow {
  id: string;
  documentName: string;
  module: string;
  status: 'Ready' | 'Planned';
  nextConnection: string;
  description: string;
}

const DEFAULT_QUOTATION_TEMPLATE: QuotationTemplateSettings = {
  title: 'COMMERCIAL PROPOSAL',
  primaryColor: '#1E3964',
  openingText: 'Reference to your query on the above subject, we are pleased to enclose herewith our OFFER for your perusal and due consideration.',
  showOpening: true,
  showCommercialTerms: true,
  showTerms: true,
  showNotes: true,
  includeStampByDefault: true,
};

@Component({
  selector: 'app-document-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGridComponent, NgxExtendedPdfViewerModule],
  templateUrl: './document-settings.component.html',
  styleUrls: ['./document-settings.component.css'],
})
export class DocumentSettingsComponent implements OnInit, OnDestroy {
  @ViewChild(DataGridComponent) private dataGrid?: DataGridComponent<DocumentSettingsRow>;

  private quotationService = inject(QuotationService);
  private systemSettings = inject(SystemSettingService);

  previewUrl = '';
  previewLoading = false;
  previewError = '';
  settingsLoading = true;
  saving = false;
  saveMessage = '';
  customize = false;
  quotationTemplate = { ...DEFAULT_QUOTATION_TEMPLATE };

  readonly breadcrumbs: DataGridBreadcrumb[] = [
    { label: 'Home', link: '/' },
    { label: 'Settings' },
    { label: 'Document' },
  ];

  readonly documents: DocumentSettingsRow[] = [
    { id: 'quotation', documentName: 'Quotation', module: 'Sales', status: 'Ready', nextConnection: 'Quotation output', description: 'Customer quote format, notes, terms and print defaults.' },
    { id: 'po', documentName: 'PO', module: 'Purchase', status: 'Planned', nextConnection: 'Purchase order output', description: 'Supplier purchase order layout, commercial text and footer controls.' },
    { id: 'grn', documentName: 'GRN', module: 'Inventory', status: 'Planned', nextConnection: 'Goods receipt output', description: 'Receiving document labels, acknowledgement text and print defaults.' },
    { id: 'delivery-note', documentName: 'Delivery Note', module: 'Inventory', status: 'Planned', nextConnection: 'Delivery note output', description: 'Customer delivery document layout, item details and acknowledgement controls.' },
    { id: 'invoice', documentName: 'Invoice', module: 'Finance', status: 'Planned', nextConnection: 'Invoice output', description: 'Invoice layout, finance footer text and customer-facing print controls.' },
  ];

  readonly columns: DataGridColumn<DocumentSettingsRow>[] = [
    { key: 'documentName', label: 'Document Name', sortable: true, locked: true },
    { key: 'module', label: 'Module', sortable: true, width: '140px' },
    { key: 'status', label: 'Status', type: 'badge', width: '130px', badgeClasses: {
      Ready: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
      Planned: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
    } },
    { key: 'nextConnection', label: 'Next Connection', sortable: true },
    { key: 'description', label: 'Description' },
  ];

  readonly rowActions: DataGridRowAction<DocumentSettingsRow>[] = [
    { id: 'preview', label: 'Preview PDF', icon: 'eye', quick: true },
    { id: 'customize', label: 'Customize', icon: 'settings', hidden: (row) => row.id !== 'quotation' },
  ];

  readonly title = (row: DocumentSettingsRow) => row.documentName;
  readonly subtitle = (row: DocumentSettingsRow) => row.nextConnection;

  ngOnInit(): void {
    this.systemSettings.getDocuments().subscribe({
      next: ({ data }) => {
        this.quotationTemplate = { ...DEFAULT_QUOTATION_TEMPLATE, ...data.quotation };
        this.settingsLoading = false;
      },
      error: () => {
        this.settingsLoading = false;
        this.previewError = 'Saved document settings could not be loaded.';
      },
    });
  }

  onRowAction(event: DataGridRowActionEvent<DocumentSettingsRow>): void {
    this.customize = event.action.id === 'customize';
    this.dataGrid?.openRow(event.row);
  }

  openPreview(row: DocumentSettingsRow): void {
    this.releasePreviewUrl();
    this.previewError = '';
    this.saveMessage = '';
    if (row.id !== 'quotation') {
      this.previewLoading = false;
      this.previewError = `${row.documentName} preview will be available when its output is connected.`;
      return;
    }
    this.previewLoading = true;
    this.quotationService.generatePDF(this.sampleQuotation(), undefined, this.quotationTemplate)
      .then((pdf) => pdf.getBlob((blob: Blob) => {
        this.previewUrl = window.URL.createObjectURL(blob);
        this.previewLoading = false;
      }))
      .catch((error) => {
        console.error('Unable to generate quotation template preview:', error);
        this.previewLoading = false;
        this.previewError = 'The quotation PDF preview could not be generated.';
      });
  }

  refreshPreview(): void {
    this.openPreview(this.documents[0]);
  }

  saveTemplate(): void {
    this.saving = true;
    this.saveMessage = '';
    const body: DocumentSettings = { quotation: { ...this.quotationTemplate } };
    this.systemSettings.saveDocuments(body).subscribe({
      next: ({ data }) => {
        this.quotationTemplate = { ...data.quotation };
        this.saving = false;
        this.saveMessage = 'Quotation template saved.';
        this.refreshPreview();
      },
      error: () => {
        this.saving = false;
        this.saveMessage = 'The template could not be saved.';
      },
    });
  }

  resetTemplate(): void {
    this.quotationTemplate = { ...DEFAULT_QUOTATION_TEMPLATE };
    this.refreshPreview();
  }

  ngOnDestroy(): void {
    this.releasePreviewUrl();
  }

  private releasePreviewUrl(): void {
    if (this.previewUrl) {
      window.URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = '';
    }
  }

  private sampleQuotation(): any {
    return {
      quoteId: ' ',
      client: { companyName: '', companyAddress: '', clientRef: '' },
      attention: { courtesyTitle: '', firstName: '', lastName: '', phoneNo: '' },
      date: null,
      closingDate: null,
      validityDate: null,
      department: { departmentName: '' },
      subject: '',
      currency: '',
      quoteCompany: 'Neuron Technologies',
      createdBy: { _id: 'preview', firstName: '', lastName: '', contactNo: '', email: '' },
      paymentTerms: '',
      deliveryTerms: '',
      warranty: '',
      deliveryLocation: '',
      termsAndCondition: '',
      customerNote: '',
      optionalItems: [],
    };
  }
}
