import { Component } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators, AbstractControl, ValidationErrors, ValidatorFn, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { Estimations } from 'src/app/shared/interfaces/enquiry.interface';
import { QuoteItemDetail } from 'src/app/shared/interfaces/quotation.interface';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';
import { OptionalItemsComponent } from '../../../../shared/components/optional-items/optional-items.component';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { NumberFormatterPipe } from '../../../../shared/pipes/numFormatter.pipe';

@Component({
    selector: 'app-upload-estimation',
    templateUrl: './upload-estimation.component.html',
    styleUrls: ['./upload-estimation.component.css'],
    imports: [FormsModule, ReactiveFormsModule, NgSelectComponent, NgOptionComponent, OptionalItemsComponent, RouterLink, NgIf, NgIcon, NumberFormatterPipe]
})
export class UploadEstimationComponent {
  submit: boolean = false;
  enqId!: string;
  isSaving: boolean = false;
  availabilityDefaultOptions: string[] = [
    "Ex-Stock",
    "Ex-Stock (Subject to Prior Sale)",
    "6-8 Weeks",
    "2-3 Weeks",
    "4-6 Weeks"
  ];
  availabiltyInput$ = new Subject<string>();

  patchOptionalItems!:any;

  calculatedValues: { totalCost: number, sellingPrice: number, totalProfit: number, discount: number } = {
    totalCost: 0,
    sellingPrice: 0,
    totalProfit: 0,
    discount: 0
  }

  constructor(
    private _fb: FormBuilder,
    private _router: Router,
    public toastr: ToastrService,
    private _enquiryService: EnquiryService
  ) {
    this.getEnquiryId()
  }

  quoteForm = this._fb.group({
    currency: [null, Validators.required],
    optionalItems: this._fb.array([]),
    totalDiscount: ['', Validators.required],
    presaleNote: ['', Validators.required],
  });

  get optionalItems() {
    return this.quoteForm.get('optionalItems') as FormArray;
  }

  get f() {
    return this.quoteForm.controls;
  }

  getEnquiryId() {
    const navigation = this._router.getCurrentNavigation();
    const isUpload = this._router.url.includes('upload-estimations')
    const isEdit = this._router.url.includes('edit-estimations')
    if (navigation && isUpload) {
      this.quoteForm.patchValue({ totalDiscount: '0' })
      this.enqId = navigation.extras.state?.['enquiryId']
    } else if (navigation && isEdit) {
      const estimations = navigation.extras.state?.['estimation']
      this.enqId = navigation.extras.state?.['enquiryId']
      this.optionalItems.clear()
      this.patchOptionalItems = estimations.optionalItems;
      this.quoteForm.patchValue({
        currency: estimations.currency,
        presaleNote: estimations.presaleNote,
        totalDiscount: estimations.totalDiscount
      })
    } else {
      this._router.navigate(['/assigned-jobs']);
    }
  }
  


  onSubmit() {
    this.submit = true;
    if (this.enqId && this.quoteForm.valid) {
      this.isSaving = true;
      const quoteForm = this.quoteForm.value
      const postBody = { optionalItems: quoteForm.optionalItems, enquiryId: this.enqId, currency: quoteForm.currency, preSaleNote: quoteForm.presaleNote, totalDiscount: quoteForm.totalDiscount }
      this._enquiryService.uploadEstimations(postBody).subscribe({
        next: (data) => {
          if (data.success) {
            this.toastr.success('Estimation Updated!', 'Success')
            this._router.navigate(['/assigned-jobs']);
          } else {
            this.isSaving = false;
            this.toastr.warning('Something went Wrong!', 'Warning')
          }
        },
        error: () => {
          this.isSaving = false;
        }
      })

    } else {
      this.isSaving = false;
      this.toastr.warning('Check the fields properly!', 'Warning !')
    }

  }

  onCalculatedValuesReceived(values: { totalCost: number, sellingPrice: number, totalProfit: number,discount:number }) {
    this.calculatedValues = values;
  }

  calculateDiscountPrice() {
    return (
      this.calculatedValues.sellingPrice -
      (Number(this.quoteForm.get('totalDiscount')?.value) || 0)
    );
  }

  formatNumber(value: any, minimumFractionDigits: number = 2, maximumFractionDigits: number = 2): string {
    if (isNaN(value)) {
      return '';
    }

    return parseInt(value).toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits
    });
  }

}
