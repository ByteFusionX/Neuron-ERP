import { HttpEventType } from '@angular/common/http';
import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NavigationExtras, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import saveAs from 'file-saver';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { Quotatation, getQuotatation, quotatationForm } from 'src/app/shared/interfaces/quotation.interface';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NgIcon } from '@ng-icons/core';
import { NgIf, NgFor, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
import { ParseBoldTextPipe } from '../../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../../shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-quotation-view',
    templateUrl: './quotation-view.component.html',
    styleUrls: ['./quotation-view.component.css'],
    imports: [NgIcon, NgIf, NgFor, FormsModule, ResizableComponent, DecimalPipe, DatePipe, ParseBoldTextPipe, ParseBracketsTextPipe, NumberFormatterPipe]
})
export class QuotationViewComponent {
  quoteData!: getQuotatation;
  isDownloading: boolean = false;
  isPreviewing: boolean = false;
  showRevision: boolean = false;
  isSaving: boolean = false;
  showError: boolean = false;
  revisionComment: string = '';
  progress: number = 0;
  selectedOption: number = 0;
  isDeleteOption:boolean = false;

  subscriptions = new Subscription();

  constructor(
    private _router: Router,
    private quotationService: QuotationService,
    private _enquiryService: EnquiryService,
    private _dialog: MatDialog,
    private toast: ToastrService,
    private _employeeService: EmployeeService
  ) {
    this.getQuoteData();

    this.subscriptions.add(
      this._employeeService.employeeData$.subscribe((employee) => {
        if (employee?.category.role == 'superAdmin') {
          this.isDeleteOption = true
        }

      })
    )
  }

  getQuoteData() {
    const navigation = this._router.getCurrentNavigation();

    if (navigation && navigation.extras.state) {
      this.quoteData = navigation.extras.state as getQuotatation;
    } else {
      this._router.navigate(['/quotations']);
    }
  }

  onQuoteEdit() {
    let quoteData: quotatationForm = this.quoteData; 
    const navigationExtras: NavigationExtras = {
      state: quoteData
    };

    this._router.navigate(['/quotations/edit'], navigationExtras);
  }

  onDownloadPdf(includeStamp:boolean) {
    this.isDownloading = true;
    let quoteData: getQuotatation = this.quoteData;
    const pdfDoc = this.quotationService.generatePDF(quoteData, includeStamp)
    pdfDoc.then((pdf) => {
      pdf.download(quoteData.quoteId as string)
      this.isDownloading = false;
    })
  }

  onPreviewPdf() {
    this.isPreviewing = true;
    let quoteData: getQuotatation = this.quoteData;
    const pdfDoc = this.quotationService.generatePDF(quoteData,true)
    pdfDoc.then((pdf) => {
      pdf.getBlob((blob: Blob) => {
        let url = window.URL.createObjectURL(blob);
        this.isPreviewing = false;
        let dialogRef = this._dialog.open(PdfPreviewComponent,
          { data: { url: url, formatedQuote: quoteData }});
      });
    });

  }

  onDownloadClicks(file: any) {
    this._enquiryService.downloadFile(file.fileName)
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
          } else if (event.type === HttpEventType.Response) {
            const fileContent: Blob = new Blob([event['body']])
            saveAs(fileContent, file.originalname)
          }
        },
        error: (error) => {
          if (error.status == 404) {
            this.toast.warning('Sorry, The requested file was not found on the server. Please ensure that the file exists and try again.')
          }
        }
      })
  }

  isReviseNeeded() {
    if (this.quoteData.enqId?.preSale && this.quoteData.status !== 'Won') {
      return true
    }
    return false
  }

  validateComments() {
    if (!this.revisionComment.trim()) {
      this.showError = true;
    } else {
      this.showError = false;
    }
  }

  onRevision() {
    this.showRevision = !this.showRevision;
    this.isSaving = false;
    // this.revisionComment = this.quoteData.enqId.preSale.estimations.presaleNote
  }

  onSubmit() {
    if (this.revisionComment && this.quoteData._id) {
      this.isSaving = true;
      this.subscriptions.add(
        this._enquiryService.quoteRevision(this.revisionComment, this.quoteData.enqId._id, this.quoteData._id).subscribe((res: any) => {
          if (res.success) {
            this.onRevision()
            this._router.navigate(['/quotations']);
          }
        })
      )
    } else {
      this.showError = true;
    }
  }

  calculateTotalCost(i: number, j: number, k: number) {
    return this.quoteData.optionalItems[this.selectedOption].items[j].itemDetails[k].quantity *
      this.quoteData.optionalItems[this.selectedOption].items[j].itemDetails[k].unitCost;
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.quoteData.optionalItems[this.selectedOption].items.forEach((item, j) => {
        item.itemDetails.forEach((itemDetail, k) => {
          totalCost += this.calculateTotalCost(this.selectedOption, j, k)
        })
      })

    return totalCost;
  }

  calculateSellingPrice(): number {
    let totalCost = 0;
    this.quoteData.optionalItems[this.selectedOption].items.forEach((item, j) => {
      item.itemDetails.forEach((itemDetail, k) => {
          totalCost += this.calculateTotalPrice(this.selectedOption, j, k)
        })
      })

    return totalCost;
  }

  calculateProfit(i: number, j: number, k: number) {
    const unitCost = this.quoteData.optionalItems[i].items[j].itemDetails[k].unitCost;
    const unitSellingPrice = this.quoteData.optionalItems[i].items[j].itemDetails[k].unitSellingPrice;
    
    if (unitCost && unitSellingPrice) {
      return (((unitSellingPrice - unitCost) / unitSellingPrice) * 100).toFixed(2);
    }
    return 0;
  }

  calculateTotalPrice(i: number, j: number, k: number) {
    return this.quoteData.optionalItems[i].items[j].itemDetails[k].unitSellingPrice * this.quoteData.optionalItems[i].items[j].itemDetails[k].quantity;
  }

  calculateProfitMargin(): number {
    return this.calculateDiscoutPrice() - this.calculateAllTotalCost() || 0
  }

  calculateTotalProfit(): number {
    return ((this.calculateDiscoutPrice() - this.calculateAllTotalCost()) / this.calculateDiscoutPrice() * 100) || 0
  }

  calculateDiscoutPrice(): number {
    return this.calculateSellingPrice() - this.quoteData.optionalItems[this.selectedOption].totalDiscount
  }

  deleteQuote() {
    const employee = this._employeeService.employeeToken()
    const dialogRef = this._dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Quote',
        description: 'Are you sure you want to delete this quote?',
        icon: 'heroExclamationCircle',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.quotationService.deleteQuotation({ dataId: this.quoteData._id!, employeeId: employee.id }).subscribe({
          next: () => {
            this.toast.success('Quote deleted successfully');
            this._router.navigate(['/quotations']);
          },
          error: (error) => {
            this.toast.error(error.error.message || 'Failed to delete quote');
          }
        });
      }
    });
  }
  
}
