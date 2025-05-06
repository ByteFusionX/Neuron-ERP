import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgxExtendedPdfViewerComponent, NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { getQuotatation } from '../../interfaces/quotation.interface';
import { FormsModule } from '@angular/forms';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-quotation-preview',
    templateUrl: './quotation-preview.component.html',
    styleUrls: ['./quotation-preview.component.css'],
    imports: [CommonModule, NgxExtendedPdfViewerModule, FormsModule]
})
export class QuotationPreviewComponent {
  @ViewChild(NgxExtendedPdfViewerComponent, { static: false })
  private pdfViewer!: NgxExtendedPdfViewerComponent;
  url: string = '';
  includeStamp: boolean = true;
  isPreviewing: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<QuotationPreviewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { url: string, formatedQuote: getQuotatation },
    private _quoteService: QuotationService
  ) {
    this.url = data.url;
    dialogRef.beforeClosed().subscribe((result) => {
      this.pdfViewer.ngOnDestroy();
    });
  }

  
  public onCloseClick(): void {
    this.dialogRef.close();
  }



  async previewQuote() {
    const pdfDoc = await this._quoteService.generatePDF(this.data.formatedQuote, this.includeStamp);
    pdfDoc.getBlob((blob: Blob) => {
      let url = window.URL.createObjectURL(blob);
      this.isPreviewing = false;
      this.url = url;
    });
  }
}
