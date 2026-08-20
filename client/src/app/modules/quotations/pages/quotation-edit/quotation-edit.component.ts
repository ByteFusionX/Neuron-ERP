import { DatePipe, NgFor, NgIf, AsyncPipe } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { AbstractControlOptions, FormArray, FormBuilder, FormControl, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { NgSelectConfig, NgSelectComponent, NgOptionComponent, NgFooterTemplateDirective } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, first } from 'rxjs';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import { customerNotes, termsAndConditions } from 'src/app/shared/constants/constant';
import { ContactDetail, getCustomer } from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { OptionalItems, Quotatation, QuoteItem, getQuotatation, quotatationForm } from 'src/app/shared/interfaces/quotation.interface';
import { fadeInOut } from 'src/app/shared/animations/animations';
import { Note, Notes } from 'src/app/shared/interfaces/notes.interface';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { appBulletList } from '../../../../shared/directives/bullet-list.directive';
import { OptionalItemsComponent } from '../../../../shared/components/optional-items/optional-items.component';
import { NgIcon } from '@ng-icons/core';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';


@Component({
    selector: 'app-quotation-edit',
    templateUrl: './quotation-edit.component.html',
    styleUrls: ['./quotation-edit.component.css'],
    animations: [fadeInOut],
    providers:[DatePipe],
    imports: [FormsModule, ReactiveFormsModule, NgSelectComponent, NgFor, NgOptionComponent, NgFooterTemplateDirective, RouterLink, appNoLeadingSpace, appBulletList, OptionalItemsComponent, NgIf, NgIcon, AsyncPipe, NumberFormatterPipe]
})
export class QuotationEditComponent {
  customers$!: Observable<getCustomer[]>;

  quoteData!: quotatationForm;
  quoteForm!: FormGroup;
  departments: getDepartment[] = [];
  contacts: ContactDetail[] = []
  tokenData!: { id: string, employeeId: string };
  customerNotes!: Note[];
  termsAndConditions!: Note[];

  availabilityDefaultOptions: string[] = [
    "Ex-Stock",
    "Ex-Stock (Subject to Prior Sale)",
    "6-8 Weeks",
    "2-3 Weeks",
    "4-6 Weeks"
  ];
  availabiltyInput$ = new Subject<string>();
  removedItems: any[] = [];
  removedItemDetails: any[] = [];

  submit: boolean = false;
  isSaving: boolean = false;
  isDownloading: boolean = false;
  isDownloadingStamped: boolean = false;
  isPreviewing: boolean = false;
  isTextSelected: boolean = false;

  @ViewChild('inputTextArea') inputTextArea!: ElementRef;

  estimatedOptionalItems!: OptionalItems[];
  calculatedValues: {
    totalCost: number;
    sellingPrice: number;
    totalProfit: number;
    discount: number;
  } = {
    totalCost: 0,
    sellingPrice: 0,
    totalProfit: 0,
    discount: 0,
  }

  constructor(
    private config: NgSelectConfig,
    private _router: Router,
    private _fb: FormBuilder,
    private _customerService: CustomerService,
    private _profileService: ProfileService,
    private _quoteService: QuotationService,
    private _dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _datePipe: DatePipe,
    private toastr: ToastrService,
    private snackBar: MatSnackBar
  ) {
    this.getQuoteData();
    document.addEventListener('selectionchange', () => {
      if (document.activeElement instanceof HTMLTextAreaElement) {
        this.checkTextSelection(document.activeElement);
      } else {
        this.isTextSelected = false;
      }
    });
  }

  ngOnInit() {
    this.config.notFoundText = 'Custom not found';
    this.config.appendTo = 'body';
    this.config.bindValue = 'value';

    this.getAllCustomers();
    this.getDepartment();
    this.getNotes();
    this.tokenData = this._employeeService.employeeToken();

    this.quoteForm = this._fb.group({
      client: [null, Validators.required],
      attention: [null, Validators.required],
      date: ['', Validators.required],
      department: [null, Validators.required],
      subject: ['', Validators.required],
      currency: [null, Validators.required],
      quoteCompany: [null, Validators.required],
      optionalItems: this._fb.array([]),
      customerNote: ['', Validators.required],
      termsAndCondition: ['', Validators.required],
      createdBy: [''],
      closingDate: ['', Validators.required]
    });

    if (this.quoteData) {
      this.quoteData.date = this._datePipe.transform(this.quoteData.date, 'yyyy-MM-dd');
      if (this.quoteData.closingDate) {
        this.quoteData.closingDate = this._datePipe.transform(this.quoteData.closingDate, 'yyyy-MM-dd') as string;
      }
      this.quoteForm.controls['client'].setValue(this.quoteData.client);
      this.quoteForm.patchValue(this.quoteData)
      this.estimatedOptionalItems = this.quoteData.optionalItems;
    }
  }


  getQuoteData() {
    const navigation = this._router.getCurrentNavigation();
    if (navigation) {
      this.quoteData = navigation.extras.state as quotatationForm
      this.quoteData.client = (this.quoteData.client as getCustomer)?._id
      this.quoteData.attention = (this.quoteData?.attention as ContactDetail)?._id
      this.quoteData.department = (this.quoteData.department as getDepartment)?._id
      this.quoteData.createdBy = (this.quoteData.createdBy as getEmployee)?._id
    } else {
      this._router.navigate(['/quotations']);
    }
  }

  get optionalItems() {
    return this.quoteForm.get('optionalItems') as FormArray;
  }

  getAllCustomers() {
    let userId;
    this._employeeService.employeeData$.subscribe((data) => {
      userId = data?._id
    })
    this.customers$ = this._customerService.getAllCustomers(userId);
    if (this.quoteData) {
      this.onCustomerChange(this.quoteData.client,false)
    }
  }

  get f() {
    return this.quoteForm.controls;
  }

  getDepartment() {
    this._profileService.getDepartments().subscribe((res: getDepartment[]) => {
      this.departments = res;
    })
  }

  getNotes() {
    this._profileService.getNotes().subscribe((res: Notes) => {
      this.customerNotes = res.customerNotes
      this.termsAndConditions = res.termsAndConditions
    })
  }

  async onCustomerChange(event: string | getCustomer, fromTemplate: boolean) {
    if (fromTemplate) {
      this.quoteForm.controls['attention'].patchValue(undefined)
    }
    const customers = await this.customers$.pipe(first()).toPromise() as getCustomer[];
    const customer: getCustomer | undefined = customers.find((value) => value._id == event)
    if (customer) {
      this.contacts = customer?.contactDetails;
    }
  }



  onCustomerNote(event: Note, noteType: string) {
    if (noteType == 'customerNotes') {
      this.quoteForm.patchValue({ customerNote: event.note ?? '' })
    } else if (noteType == 'termsAndConditions') {
      this.quoteForm.patchValue({ termsAndCondition: event.note ?? '' })
    }
  }

  onCalculatedValuesReceived(values: {
    totalCost: number;
    sellingPrice: number;
    totalProfit: number;
    discount: number;
  }) {
    this.calculatedValues = values;
  }

  calculateTotalCost() {
    return this.calculatedValues.totalCost;
  }

  calculateSubtotal() {
    return this.calculatedValues.sellingPrice;
  }

  calculateDiscountPrice() {
    return this.calculateSubtotal() - (this.calculatedValues.discount || 0);
  }

  calculateProfitMarginAmount() {
    return this.calculateDiscountPrice() - this.calculateTotalCost();
  }

  calculateProfitMarginPercentage() {
    const sellingPrice = this.calculateDiscountPrice();
    const totalCost = this.calculateTotalCost();
    return sellingPrice > 0
      ? ((sellingPrice - totalCost) / sellingPrice) * 100
      : 0;
  }

  calculateFinalTotalAmount() {
    return this.calculateDiscountPrice();
  }

  async onDownloadPdf(includeStamp: boolean) {
    this.submit = true;

    if (this.quoteForm.valid) {
      if (includeStamp) {
        this.isDownloadingStamped = true;
      } else {
        this.isDownloading = true;
      }
      let quoteData: quotatationForm = this.quoteForm.value;

      const customers = await this.customers$.pipe(first()).toPromise() as getCustomer[];
      const customer = customers.find(c => c._id === quoteData.client);
      if (customer) {
        quoteData.client = customer;
      }

      const contact = this.contacts.find(c => c._id === quoteData.attention);
      if (contact) {
        quoteData.attention = contact;
      }

      this._employeeService.employeeData$.subscribe((employee) => {
        quoteData.createdBy = employee
      })

      quoteData.quoteId = this.quoteData.quoteId;

      const finalQuoteData: getQuotatation = quoteData as getQuotatation;

      const pdfDoc = this._quoteService.generatePDF(finalQuoteData, includeStamp)
      pdfDoc
        .then((pdf) => {
          pdf.download(quoteData.quoteId as string)
        })
        .catch((error) => {
          console.error('Error generating PDF:', error);
          this.toastr.error('Error generating PDF. Please try again.', 'Error');
        })
        .finally(() => {
          if (includeStamp) {
            this.isDownloadingStamped = false;
          } else {
            this.isDownloading = false;
          }
        });
    } else {
      this.toastr.warning('Check the fields properly!', 'Warning !')
    }
  }


  async onPreviewPdf() {
    this.submit = true;
    if (this.quoteForm.valid) {
      this.isPreviewing = true;

      try {
        const quoteData: quotatationForm = this.quoteForm.value;

        const customers = await this.customers$.pipe(first()).toPromise() as getCustomer[];
        const customer = customers.find(c => c._id === quoteData.client);
        if (customer) {
          quoteData.client = customer;
        }

        const contact = this.contacts.find(c => c._id === quoteData.attention);
        if (contact) {
          quoteData.attention = contact;
        }

        this._employeeService.employeeData$.subscribe((employee) => {
          quoteData.createdBy = employee
        })

        const finalQuoteData: getQuotatation = quoteData as unknown as getQuotatation;

        const pdfDoc = await this._quoteService.generatePDF(finalQuoteData, true);
        pdfDoc.getBlob((blob: Blob) => {
          let url = window.URL.createObjectURL(blob);
          this.isPreviewing = false;
          this._dialog.open(PdfPreviewComponent, { data: { url: url, formatedQuote: finalQuoteData } });
        });

      } catch (error) {
        console.error('Error generating PDF:', error);
        this.toastr.error('Error generating PDF. Please try again.', 'Error');
      }
    } else {
      this.toastr.warning('Check the fields properly!', 'Warning !');
    }
  }


  onQuoteSaveSubmit() {
    this.submit = true;
    if (this.quoteForm.valid) {
      const dialogRef = this._dialog.open(ActionConfirmationDialogComponent, {
        data: {
          title: 'Save Quotation',
          description:
            'Are you sure you want to save this quotation? You can add a note to help you remember the context of this save.',
          icon: 'heroExclamationTriangle',
          iconColor: 'orange',
          confirmButtonText: 'Save',
          requireComment: true,
          showComment: true,
          commentLabel: 'Note',
          commentPlaceholder: 'Enter a note about this quotation...',
          initialComment: this.quoteData?.saveNote || '',
        },
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.isConfirmed) {
          this.saveQuote(result.comment);
        }
      });
    } else {
      this.isSaving = false;
      this.toastr.warning('Check the fields properly!', 'Warning !')
    }

  }

  private saveQuote(saveNote: string) {
    this.isSaving = true;
    const quoteFormValue = this.quoteForm.value;

    const sanitizedQuoteFormValue = JSON.parse(JSON.stringify(quoteFormValue));
    sanitizedQuoteFormValue.optionalItems.forEach((optionItem: any) => {
      optionItem.items.forEach((item: any) => {
        item.itemDetails.forEach((detail: any) => {
          delete detail.unitPrice;
        });
      });
    });

    sanitizedQuoteFormValue.saveNote = saveNote;

    this._quoteService.updateQuotation(sanitizedQuoteFormValue, this.quoteData._id).subscribe({
      next: (res: Quotatation) => {
        this.isSaving = false;
        this._router.navigate(['/quotations'])
      },
      error: () => {
        this.isSaving = false;
      }
    })
  }

  checkTextSelection(textarea: HTMLTextAreaElement) {
    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    this.isTextSelected = selectedText.length > 0;
  }



}
