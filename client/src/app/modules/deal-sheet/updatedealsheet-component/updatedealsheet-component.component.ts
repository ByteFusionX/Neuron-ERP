import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidatorFn, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { priceDetails, Quotatation, QuoteItem, QuoteItemDetail } from 'src/app/shared/interfaces/quotation.interface';
import { fileEnterState } from '../../enquirys/enquiry-animations';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIcon } from '@ng-icons/core';
import { NgIf, NgFor, NgClass, DecimalPipe } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { ParseBoldTextPipe } from '../../../shared/pipes/boldParse.pipe';
import { ParseBracketsTextPipe } from '../../../shared/pipes/highlightParse.pipe';


@Component({
    selector: 'app-updatedealsheet-component',
    templateUrl: './updatedealsheet-component.component.html',
    styleUrls: ['./updatedealsheet-component.component.css'],
    animations: [fileEnterState],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, NgIf, NgFor, NgClass, MatTooltip, DecimalPipe, ParseBoldTextPipe, ParseBracketsTextPipe]
})
export class UpdatedealsheetComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;

  costForm!: FormGroup;
  isSubmitted = false;
  isAllSelected = false;
  isSaving = false;
  selectedFiles: any[] = [];
  removedFiles: any[] = [];
  existingFiles: any[] = [];

  selectedOption: number = 0;


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { approval: boolean, quoteData: Quotatation, quoteItems: (QuoteItem | undefined)[], priceDetails: priceDetails, quoteView: boolean },
    public dialogRef: MatDialogRef<UpdatedealsheetComponent>,
    public _dialog: MatDialog,
    private fb: FormBuilder
  ) { }

  ngOnInit() {
    this.costForm = this.fb.group({
      paymentTerms: [this.data.quoteData.dealData.paymentTerms || '', Validators.required],
      items: this.fb.array(this.data.quoteItems.map(item => this.createItemGroup(item as QuoteItem))),
      costs: this.fb.array([], this.additionalCostsValidator())
    });
    this.data.quoteData.dealData.additionalCosts.forEach((cost) => {
      this.patchCost(cost)
    })

    this.selectedFiles = this.data.quoteData.dealData.attachments;
    this.existingFiles = [...this.selectedFiles]
  }

  onCalculationOptionChange() {
    this.items.clear();
    this.data.quoteData.optionalItems[this.selectedOption].items.forEach(item => {
      this.items.push(this.createItemGroup(item));
    });
  }

  setUpFormData(): FormData {
    let formData = new FormData();

    let data = this.costForm.value;
    const updatedItems = data.items.map((item: any) => ({
      ...item,
      itemDetails: item.itemDetails.map((detail: any) => ({
        ...detail,
        supplierName: detail.supplierName,
        phoneNo: detail.phoneNo,
        email: detail.email,
      })),
    }));
    formData.append('dealData', JSON.stringify({ ...data, items: updatedItems, removedFiles: this.removedFiles, existingFiles: this.existingFiles, totalDiscount: this.data.quoteData.optionalItems[this.selectedOption].totalDiscount }));
    for (let i = 0; i < this.selectedFiles.length; i++) {
      formData.append('attachments', (this.selectedFiles[i] as Blob))
    }

    return formData;
  }

  onSubmit() {
    this.isSubmitted = true;
    if (this.costForm.valid) {
      this.isSaving = true;
      const formData = this.setUpFormData()
      this.dialogRef.close(formData);
    }
  }

  get items(): FormArray {
    return this.costForm.get('items') as FormArray;
  }

  get f() {
    return this.costForm.controls;
  }

  onFileSelected(event: any) {
    let files = event.target.files
    for (let i = 0; i < files.length; i++) {
      const newFile = files[i]
      const exist = (this.selectedFiles as File[]).some((file: File) => file.name === newFile.name)
      if (!exist) {
        (this.selectedFiles as File[]).push(files[i])
      }
    }
  }

  onFileRemoved(index: number) {
    let removedFiles = (this.selectedFiles as File[]).splice(index, 1)
    this.existingFiles.splice(index, 1)
    this.removedFiles.push(...removedFiles)
  }

  fetchLatestQuote() {
    const dialogRef = this._dialog.open(ConfirmationDialogComponent,
      {
        data: {
          title: `Are you absolutely sure?`,
          description: `This action is irreversible. This will remove all the entered data and replace it with the latest quotation.`,
          icon: 'heroExclamationCircle',
          IconColor: 'orange'
        }
      });

    dialogRef.afterClosed().subscribe((approved: boolean) => {
      if (approved) {
        this.items.clear()

        // Add new controls to the FormArray
        this.data.quoteData.optionalItems[0].items.forEach(item => {
          this.items.push(this.createItemGroup(item as QuoteItem));
        });
      }
    })
  }


  createItemGroup(item: QuoteItem): FormGroup {
    return this.fb.group({
      itemName: [item.itemName || ''],
      itemDetails: this.fb.array(item.itemDetails.map(detail => this.createItemDetailGroup(detail)))
    });

  }

  createItemDetailGroup(detail: QuoteItemDetail): FormGroup {
    const profit = (((detail.unitSellingPrice - detail.unitCost) / detail.unitSellingPrice) * 100).toFixed(2);

    return this.fb.group({
      dealSelected: [detail.dealSelected || false],
      detail: [detail.detail, Validators.required],
      quantity: [detail.quantity, Validators.required],
      unitCost: [detail.unitCost, Validators.required],
      profit: [profit, Validators.required],
      unitSellingPrice: [detail.unitSellingPrice, Validators.required],
      availability: [detail.availability, Validators.required],
      supplierName: [detail.supplierName, this.supplierNameValidator()],
      phoneNo: [detail.phoneNo, this.supplierNameValidator()],
      email: [detail.email, [this.supplierNameValidator(), Validators.email]],
    });
  }

  supplierNameValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const formGroup = control.parent as FormGroup;
      if (formGroup) {
        const dealSelected = formGroup.get('dealSelected')?.value;
        if (dealSelected && !control.value) {
          return { 'supplierNameRequired': true };
        }
      }
      return null;
    };
  }

  get paymentTermsControl(): AbstractControl {
    return this.costForm.get('paymentTerms')!;
  }

  additionalCostsValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const costs = control as FormArray;
      if (costs.length === 0) {
        return null;
      }

      for (const cost of costs.controls) {
        const type = cost?.get('type')?.value;
        if (type !== 'Customer Discount' && !cost?.get('name')?.value) {
          return { 'additionalCostInvalid': true };
        }
        if (!cost?.get('value')?.value) {
          return { 'additionalCostInvalid': true };
        }
      }
      return null;
    };
  }

  onItemCheckboxChange(i: number, j: number, event: any) {
    const allSelected = this.items.controls.every(item => {
      return this.getItemDetailsArray(item).every(detail => detail.get('dealSelected')?.value === true);
    });

    if (!event.target.checked) {
      this.getItemDetailsArray(this.items.controls[i])[j].get('supplierName')?.setValue('')
      this.getItemDetailsArray(this.items.controls[i])[j].get('phoneNo')?.setValue('')
      this.getItemDetailsArray(this.items.controls[i])[j].get('email')?.setValue('')
    }

    this.isAllSelected = allSelected;
  }

  toggleAllSelection(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isAllSelected = isChecked;
    this.items.controls.forEach(item => {
      const itemDetails = this.getItemDetailsArray(item);
      itemDetails.forEach(detail => {
        detail.get('dealSelected')?.setValue(isChecked);
      });
    });
  }

  getItemDetailsArray(item: AbstractControl): AbstractControl[] {
    return (item.get('itemDetails') as FormArray).controls;
  }

  addCost(type: string): void {
    let group;
    group = this.fb.group({
      type: [type, Validators.required],
      value: ['', Validators.required]
    });

    if (type !== 'Customer Discount') {
      group = this.fb.group({
        type: [type, Validators.required],
        name: ['', Validators.required],
        value: ['', Validators.required]
      });
    }

    this.costs.push(group);
  }

  patchCost(cost: { type: string, value: number, name: string }): void {
    let group;
    if (!cost.type) {
      cost.type = 'Additional Cost'
    }
    group = this.fb.group({
      type: [cost.type, Validators.required],
      value: [cost.value, Validators.required]
    });

    if (cost.type !== 'Customer Discount') {
      group = this.fb.group({
        type: [cost.type, Validators.required],
        name: [cost.name, Validators.required],
        value: [cost.value, Validators.required]
      });
    }

    this.costs.push(group);
  }

  removeCost(index: number): void {
    this.costs.removeAt(index);
  }

  get costs(): FormArray {
    return this.costForm.get('costs') as FormArray;
  }

  trackByIndex(index: number): number {
    return index;
  }
  

  calculateUnitPriceForInput(i: number, j: number) {
    const itemDetail = this.getItemDetailsControls(i).controls[j] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    const unitPrice = itemDetail.get('unitCost')?.value / (1 - decimalMargin) || 0;
    itemDetail.get('unitPrice')?.setValue(Number(Math.ceil(unitPrice)).toFixed(2));
  }

  calculateProfitForInput(i: number, j: number) {
    const unitCost = this.getItemDetailsControls(i).controls[j].get('unitCost')?.value;
    const unitSellingPrice = this.getItemDetailsControls(i).controls[j].get('unitSellingPrice')?.value;
    if (unitCost && unitSellingPrice) {
      const profit = ((unitSellingPrice - unitCost) / unitSellingPrice) * 100;
      this.getItemDetailsControls(i).controls[j].get('profit')?.setValue(profit.toFixed(2));
    } else if (unitCost) {
      this.getItemDetailsControls(i).controls[j].get('profit')?.setValue('');
    }
  }

  calculateSellingPrice(): number {
    let totalCost = 0;
    this.items.value.forEach((item: any, i: number) => {
      this.getItemDetailsControls(i).value.forEach((item: any, j: number) => {
        if (item.dealSelected) {
          totalCost += this.calculateTotalPrice(i, j)
        }
      })
    })
    this.costs.value.forEach((cost: any, i: number) => {
      if (cost.type == 'Customer Discount') {
        totalCost -= cost.value
      }
    })

    return totalCost;
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.items.value.forEach((item: any, i: number) => {
      this.getItemDetailsControls(i).value.forEach((item: any, j: number) => {
        if (item.dealSelected) {
          totalCost += this.calculateTotalCost(i, j)
        }
      })
    })

    this.costs.value.forEach((cost: any, i: number) => {
      if (cost.type == 'Additional Cost') {
        totalCost += cost.value
      } else if (cost.type === 'Supplier Discount') {
        totalCost -= cost.value
      }
    })

    return totalCost;
  }



  calculateTotalCost(i: number, j: number) {
    return this.getItemDetailsControls(i).controls[j].get('quantity')?.value * this.getItemDetailsControls(i).controls[j].get('unitCost')?.value
  }

  calculateProfit(i: number, j: number) {
    const unitCost = this.getItemDetailsControls(i).controls[j].get('unitCost')?.value;
    const unitSellingPrice = this.getItemDetailsControls(i).controls[j].get('unitSellingPrice')?.value;
    
    if (unitCost && unitSellingPrice) {
      return (((unitSellingPrice - unitCost) / unitSellingPrice) * 100).toFixed(2);
    }
    return 0;
  }

  calculateTotalPrice(i: number, j: number) {
    return this.getItemDetailsControls(i).controls[j].get('unitSellingPrice')?.value * this.getItemDetailsControls(i).controls[j].get('quantity')?.value
  }

  onClose() {
    this.dialogRef.close();
  }

  getItemDetailsControls(index: number): FormArray {
    return this.items.at(index).get('itemDetails') as FormArray;
  }
}
