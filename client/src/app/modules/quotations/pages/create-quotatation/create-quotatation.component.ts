import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import {
  AbstractControlOptions,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
  Form,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import {
  NgSelectComponent,
  NgSelectConfig,
  NgOptionComponent,
  NgFooterTemplateDirective,
} from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, Subscription, first } from 'rxjs';
import { CustomerService } from 'src/app/core/services/customer/customer.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { QuotationService } from 'src/app/core/services/quotation/quotation.service';
import {
  customerNotes,
  termsAndConditions,
} from 'src/app/shared/constants/constant';
import {
  ContactDetail,
  getCustomer,
} from 'src/app/shared/interfaces/customer.interface';
import { getDepartment } from 'src/app/shared/interfaces/department.interface';
import { getEnquiry } from 'src/app/shared/interfaces/enquiry.interface';
import {
  OptionalItems,
  Quotatation,
  QuoteItem,
  getQuotatation,
  quotatationForm,
} from 'src/app/shared/interfaces/quotation.interface';
import { customerNoteValidator } from 'src/app/shared/validators/quoation.validator';
import { Note, Notes } from 'src/app/shared/interfaces/notes.interface';
import { PdfPreviewComponent } from 'src/app/shared/components/pdf-preview/pdf-preview.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ActionConfirmationDialogComponent } from 'src/app/shared/components/action-confirmation-dialog/action-confirmation-dialog.component';
import { NgIf, NgFor, AsyncPipe, DecimalPipe } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { appBulletList } from '../../../../shared/directives/bullet-list.directive';
import { ResizableComponent } from '../../../../shared/components/resizable/resizable.component';
import { OptionalItemsComponent } from '../../../../shared/components/optional-items/optional-items.component';
import { ParseBoldTextPipe } from '../../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../../shared/pipes/highlightParse.pipe';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-create-quotatation',
  templateUrl: './create-quotatation.component.html',
  styleUrls: ['./create-quotatation.component.css'],
  imports: [
    NgIf,
    NgIcon,
    FormsModule,
    ReactiveFormsModule,
    NgSelectComponent,
    NgFor,
    NgOptionComponent,
    NgFooterTemplateDirective,
    RouterLink,
    appNoLeadingSpace,
    appBulletList,
    ResizableComponent,
    OptionalItemsComponent,
    AsyncPipe,
    DecimalPipe,
    ParseBoldTextPipe,
    ParseBracketsTextPipe,
    NumberFormatterPipe,
  ],
})
export class CreateQuotatationComponent {
  customers$!: Observable<getCustomer[]>;
  enquiryData$!: Observable<getEnquiry | undefined>;

  patchSelectedOption: number = 0;

  selectedCustomer!: number;
  selectedContact!: number;
  selectedCurrency: string = 'QAR';
  selectedCutomerNote: string | null = null;
  selectedtermsAndCondition: string | null = null;

  quoteForm!: FormGroup;
  departments: getDepartment[] = [];
  customerNotes!: Note[];
  termsAndConditions!: Note[];
  contacts: ContactDetail[] = [];
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
  };

  includedOptionalItemKeys = new Set<string>();

  isItemIncludedInTotal(i: number, j: number, item: QuoteItem): boolean {
    return !item.isOptional || this.includedOptionalItemKeys.has(`${i}-${j}`);
  }

  onToggleEstimatedOptionalItem(i: number, j: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const key = `${i}-${j}`;
    if (checked) {
      this.includedOptionalItemKeys.add(key);
    } else {
      this.includedOptionalItemKeys.delete(key);
    }
    this.calculateTotalValuesAfterPactch();
  }

  private applyOptionalSelectionToEstimatedItems(
    items: OptionalItems[],
  ): OptionalItems[] {
    return items.map((option, i) => ({
      ...option,
      items: option.items.map((item, j) => ({
        ...item,
        includeInTotal: item.isOptional
          ? this.includedOptionalItemKeys.has(`${i}-${j}`)
          : undefined,
      })),
    }));
  }

  isEdit: boolean = false;
  isSaving: boolean = false;
  submit: boolean = false;
  isDownloading: boolean = false;
  isDownloadingStamped: boolean = false;
  isPreviewing: boolean = false;

  estimatedOptionalItems!: OptionalItems[];

  @ViewChild('inputTextArea') inputTextArea!: ElementRef;

  private subscriptions = new Subscription();

  constructor(
    private config: NgSelectConfig,
    private _fb: FormBuilder,
    private _customerService: CustomerService,
    private _profileService: ProfileService,
    private _quoteService: QuotationService,
    private _dialog: MatDialog,
    private _employeeService: EmployeeService,
    private _router: Router,
    private _enquiryService: EnquiryService,
    private toastr: ToastrService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    this.config.notFoundText = 'Select a client first..';
    this.config.appendTo = 'body';
    this.config.bindValue = 'value';

    this.getAllCustomers();
    this.getDepartment();
    this.getNotes();

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
      enqId: [''],
      closingDate: ['', Validators.required],
    });

    this.quoteForm.patchValue({ totalDiscount: '0' });
    this.enquiryData$ = this._enquiryService.enquiryData$;
    this.subscriptions.add(
      this.enquiryData$.subscribe((data) => {
        if (data) {
          this.quoteForm.patchValue({
            ...data,
            subject: data.title,
            date: data.date ? this.toDateInputValue(data.date) : '',
            attention: data.contact?._id,
          });
        }
      }),
    );
  }
  private toDateInputValue(value: string | Date): string {
    return new Date(value).toISOString().substring(0, 10);
  }

  get optionalItems() {
    return this.quoteForm.get('optionalItems') as FormArray;
  }

  onCalculatedValuesReceived(values: {
    totalCost: number;
    sellingPrice: number;
    totalProfit: number;
    discount: number;
  }) {
    this.calculatedValues = values;
  }

  getAllCustomers() {
    let userId;
    this._employeeService.employeeData$.subscribe((data) => {
      userId = data?._id;
    });
    this.customers$ = this._customerService.getAllCustomers(userId);
  }

  getDepartment() {
    this._profileService.getDepartments().subscribe((res: getDepartment[]) => {
      this.departments = res;
    });
  }

  getNotes() {
    this._profileService.getNotes().subscribe((res: Notes) => {
      this.customerNotes = res.customerNotes;
      this.termsAndConditions = res.termsAndConditions;
    });
  }

  get f() {
    return this.quoteForm.controls;
  }

  onCustomerNote(event: Note, noteType: string) {
    if (noteType == 'customerNotes') {
      this.quoteForm.patchValue({ customerNote: event.note ?? '' });
    } else if (noteType == 'termsAndConditions') {
      this.quoteForm.patchValue({ termsAndCondition: event.note ?? '' });
    }
  }

  onChange(change: string) {
    this.quoteForm.controls['attention'].patchValue(undefined);
    this.contacts = [];
    this.config.notFoundText = 'Wait a few Seconds..';
    if (change && this.customers$) {
      this.subscriptions.add(
        this.customers$.subscribe((data) => {
          let customer = data.find((contact) => contact._id == change);
          if (customer) {
            this.contacts = customer.contactDetails;
          }
        }),
      );
    } else {
      this.config.notFoundText = 'Select a client first..';
      this.contacts = [];
      this.quoteForm.controls['attention'].setValue(undefined);
    }
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

      if (!this.isEdit && this.estimatedOptionalItems?.length) {
        quoteData.optionalItems = this.applyOptionalSelectionToEstimatedItems(
          this.estimatedOptionalItems,
        );
      }

      const customers = (await this.customers$
        .pipe(first())
        .toPromise()) as getCustomer[];
      const customer = customers.find((c) => c._id === quoteData.client);
      if (customer) {
        quoteData.client = customer;
      }

      const contact = this.contacts.find((c) => c._id === quoteData.attention);
      if (contact) {
        quoteData.attention = contact;
      }

      this._employeeService.employeeData$.subscribe((employee) => {
        quoteData.createdBy = employee;
      });

      const finalQuoteData: getQuotatation =
        quoteData as unknown as getQuotatation;

      const pdfDoc = this._quoteService.generatePDF(
        finalQuoteData,
        includeStamp,
      );
      pdfDoc
        .then((pdf) => {
          pdf.download(quoteData.quoteId as string);
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
      this.toastr.warning('Check the fields properly!', 'Warning !');
    }
  }

  async onPreviewPdf() {
    this.submit = true;
    if (this.quoteForm.valid) {
      this.isPreviewing = true;

      try {
        const quoteData: quotatationForm = this.quoteForm.value;

        if (!this.isEdit && this.estimatedOptionalItems?.length) {
          quoteData.optionalItems = this.applyOptionalSelectionToEstimatedItems(
            this.estimatedOptionalItems,
          );
        }

        const customers = (await this.customers$
          .pipe(first())
          .toPromise()) as getCustomer[];
        const customer = customers.find((c) => c._id === quoteData.client);
        if (customer) {
          quoteData.client = customer;
        }

        const contact = this.contacts.find(
          (c) => c._id === quoteData.attention,
        );
        if (contact) {
          quoteData.attention = contact;
        }

        this._employeeService.employeeData$.subscribe((employee) => {
          quoteData.createdBy = employee;
        });

        const finalQuoteData: getQuotatation =
          quoteData as unknown as getQuotatation;

        const pdfDoc = await this._quoteService.generatePDF(
          finalQuoteData,
          true,
        );
        pdfDoc.getBlob((blob: Blob) => {
          let url = window.URL.createObjectURL(blob);
          this.isPreviewing = false;
          this._dialog.open(PdfPreviewComponent, {
            data: { url: url, formatedQuote: finalQuoteData },
          });
        });
      } catch (error) {
        console.error('Error generating PDF:', error);
        this.toastr.error('Error generating PDF. Please try again.', 'Error');
      }
    } else {
      this.toastr.warning('Check the fields properly!', 'Warning !');
    }
  }

  onQuoteSubmit() {
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
        },
      });

      dialogRef.afterClosed().subscribe((result) => {
        if (result?.isConfirmed) {
          this.saveQuote(result.comment);
        }
      });
    } else {
      this.isSaving = false;
      this.toastr.warning('Check the fields properly!', 'Warning !');
    }
  }

  private saveQuote(saveNote: string) {
    this.isSaving = true;
    const quoteFormValue = this.quoteForm.value;

    // Create a deep copy of the form value
    const sanitizedQuoteFormValue = JSON.parse(
      JSON.stringify(quoteFormValue),
    );
    if (!this.isEdit && this.estimatedOptionalItems?.length) {
      sanitizedQuoteFormValue.optionalItems = this.estimatedOptionalItems;
    }
    // Remove unitPrice from each item detail
    sanitizedQuoteFormValue.optionalItems.forEach((optionItem: any) => {
      optionItem.items.forEach((item: any) => {
        item.itemDetails.forEach((detail: any) => {
          delete detail.unitPrice;
        });
      });
    });

    if (!sanitizedQuoteFormValue.enqId) {
      delete sanitizedQuoteFormValue.enqId;
    }

    sanitizedQuoteFormValue.saveNote = saveNote;

    this._quoteService
      .saveQuotation(sanitizedQuoteFormValue)
      .subscribe((res: Quotatation) => {
        this._router.navigate(['/quotations']);
      });
  }

  patchValues(data: getEnquiry) {
    this.quoteForm.patchValue({
      client: data?.client._id,
      department: data?.department._id,
      enqId: data?._id,
    });

    this.onChange(data?.client._id as string);
    this.quoteForm.patchValue({
      attention: data?.contact._id,
      currency: data?.preSale?.estimations?.currency,
    });

    if (data?.preSale?.estimations?.optionalItems?.length) {
      this.estimatedOptionalItems = data.preSale.estimations.optionalItems;
      this.calculateTotalValuesAfterPactch();
    }
  }

  onCalculationOptionChange() {
    this.calculateTotalValuesAfterPactch();
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

  calculateProfit(i: number, j: number, k: number) {
    const unitCost =
      this.estimatedOptionalItems[i].items[j].itemDetails[k].unitCost;
    const unitSellingPrice =
      this.estimatedOptionalItems[i].items[j].itemDetails[k].unitSellingPrice;

    if (unitCost && unitSellingPrice) {
      return (((unitSellingPrice - unitCost) / unitSellingPrice) * 100).toFixed(
        2,
      );
    }
    return 0;
  }

  calculateTotalPrice(i: number, j: number, k: number) {
    return (
      this.estimatedOptionalItems[i].items[j].itemDetails[k].unitSellingPrice *
      this.estimatedOptionalItems[i].items[j].itemDetails[k].quantity
    );
  }

  calculateTotalValuesAfterPactch() {
    if (this.estimatedOptionalItems) {
      // Calculate the total values of this.calculatedValues by using data.preSale.estimations.currency
      let totalCost = 0;
      let totalSellingPrice = 0;

      this.estimatedOptionalItems[this.patchSelectedOption].items.forEach(
        (item, j) => {
          if (!this.isItemIncludedInTotal(this.patchSelectedOption, j, item)) {
            return;
          }
          item.itemDetails.forEach((itemDetail, k) => {
            const quantity = itemDetail.quantity;
            const unitCost = itemDetail.unitCost;
            const profitMargin = itemDetail.profit / 100;

            // Calculate unit price with profit margin
            const unitPrice = Number(
              (unitCost / (1 - profitMargin)).toFixed(2),
            );

            // Calculate total cost
            totalCost += quantity * unitCost;

            // Calculate total selling price
            totalSellingPrice += unitPrice * quantity;
          });
        },
      );

      const totalProfit = totalSellingPrice - totalCost;
      const profitMarginPercentage =
        (totalProfit / totalSellingPrice) * 100 || 0;

      this.calculatedValues = {
        totalCost: totalCost,
        sellingPrice: totalSellingPrice,
        totalProfit: profitMarginPercentage,
        discount:
          this.estimatedOptionalItems[this.patchSelectedOption].totalDiscount,
      };
    }
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this._enquiryService.quoteSubject.next(undefined);
  }

  onEnquiryEdit() {
    this.isEdit = true;
  }

  openDatePicker(event: Event) {
    const input = event.target as HTMLInputElement & {
      showPicker?: () => void;
    };
    input.showPicker?.();
  }
}
