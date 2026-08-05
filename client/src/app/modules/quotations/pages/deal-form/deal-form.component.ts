import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fileEnterState } from 'src/app/modules/enquirys/enquiry-animations';
import { Quotatation, QuoteItemDetail } from 'src/app/shared/interfaces/quotation.interface';

@Component({
    selector: 'app-deal-form',
    templateUrl: './deal-form.component.html',
    styleUrls: ['./deal-form.component.css'],
    animations: [fileEnterState],
    standalone: false
})
export class DealFormComponent {
  @ViewChild('fileInput') fileInput!: ElementRef;

  isSaving: boolean = false;
  isSubmitted: boolean = false;
  isAllSelected: boolean = false;
  costForm!: FormGroup;
  selectedFiles: any[] = [];
  selectedOption: number = 0;

  constructor(
    public dialogRef: MatDialogRef<DealFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Quotatation,
    private fb: FormBuilder
  ) { }

  ngOnInit() {
    this.costForm = this.fb.group({
      paymentTerms: ['', Validators.required],
      items: this.fb.array(this.data.optionalItems[0].items.map(item => this.createItemGroup(item))),
      costs: this.fb.array([], this.additionalCostsValidator())
    });
  }


  get paymentTermsControl(): AbstractControl {
    return this.costForm.get('paymentTerms')!;
  }

  get costs(): FormArray {
    return this.costForm.get('costs') as FormArray;
  }

  onCalculationOptionChange() {
    this.items.clear();
    this.data.optionalItems[this.selectedOption].items.forEach(item => {
        this.items.push(this.createItemGroup(item));
    });
  }

  createItemGroup(item: any): FormGroup {
    return this.fb.group({
      itemName: [item.itemName],
      itemDetails: this.fb.array(item.itemDetails.map((detail: QuoteItemDetail) => this.createItemDetailGroup(detail)))
    });
  }

  createItemDetailGroup(detail: QuoteItemDetail): FormGroup {
    const profit = (((detail.unitSellingPrice - detail.unitCost) / detail.unitSellingPrice) * 100).toFixed(2);

    return this.fb.group({
      dealSelected: [false],
      detail: [detail.detail, Validators.required],
      quantity: [detail.quantity, Validators.required],
      unitCost: [detail.unitCost, Validators.required],
      profit: [profit, Validators.required],
      unitSellingPrice: [detail.unitSellingPrice, Validators.required],
      availability: [detail.availability, Validators.required],
      supplierName: ['', this.supplierNameValidator()],
      phoneNo: ['', this.supplierNameValidator()],
      email: ['', [this.supplierNameValidator(), Validators.email]],
    });
  }

  getItemDetailsArray(item: AbstractControl): AbstractControl[] {
    return (item.get('itemDetails') as FormArray).controls;
  }

  get items(): FormArray {
    return this.costForm.get('items') as FormArray;
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
        name:['', Validators.required],
        value: ['', Validators.required]
      });
    } 
    
    this.costs.push(group);
  }

  removeCost(index: number): void {
    this.costs.removeAt(index);
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

  onItemCheckboxChange(i: number, j: number, event: any) {
    const allSelected = this.items.controls.every(item => {
      return this.getItemDetailsArray(item).every(detail => detail.get('dealSelected')?.value === true);
    });

    if (!event.target.checked) {
      this.getItemDetailsArray(this.items.controls[i])[j].get('quantity')?.setValue(this.data.optionalItems[this.selectedOption].items[i].itemDetails[j].quantity)
      this.getItemDetailsArray(this.items.controls[i])[j].get('unitCost')?.setValue(this.data.optionalItems[this.selectedOption].items[i].itemDetails[j].unitCost)
      this.getItemDetailsArray(this.items.controls[i])[j].get('unitSellingPrice')?.setValue(this.data.optionalItems[this.selectedOption].items[i].itemDetails[j].unitSellingPrice)
      this.getItemDetailsArray(this.items.controls[i])[j].get('supplierName')?.setValue('')
      this.getItemDetailsArray(this.items.controls[i])[j].get('phoneNo')?.setValue('')
      this.getItemDetailsArray(this.items.controls[i])[j].get('email')?.setValue('')
    }

    this.isAllSelected = allSelected;
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
    (this.selectedFiles as File[]).splice(index, 1)
    this.fileInput.nativeElement.value = '';
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
      }))
    }));
    formData.append('dealData', JSON.stringify({ ...data, items: updatedItems, totalDiscount : this.data.optionalItems[this.selectedOption].totalDiscount }));
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

  get f() {
    return this.costForm.controls;
  }

  getItemDetailsControls(index: number): FormArray {
    return this.items.at(index).get('itemDetails') as FormArray;
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

  calculateUnitSellingPriceForInput(i: number, j: number) {
    const itemDetail = this.getItemDetailsControls(i).controls[j] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    const unitSellingPrice = Number((itemDetail.get('unitCost')?.value / (1 - decimalMargin)).toFixed(2)) || 0;
    itemDetail.get('unitSellingPrice')?.setValue(Math.ceil(unitSellingPrice));
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
        if(item.dealSelected){
          totalCost += this.calculateTotalPrice(i, j)
        }
      })
    })
    this.costs.value.forEach((cost:any,i:number)=>{
      if(cost.type == 'Customer Discount'){
        totalCost -= cost.value
      }
    })

    return totalCost;
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.items.value.forEach((item: any, i: number) => {
      this.getItemDetailsControls(i).value.forEach((item: any, j: number) => {
        if(item.dealSelected){
          totalCost += this.calculateTotalCost(i, j)
        }
      })
    })

    this.costs.value.forEach((cost:any,i:number)=>{
      if(cost.type == 'Additional Cost'){
        totalCost += cost.value
      }else if(cost.type === 'Supplier Discount'){
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
    this.dialogRef.close()
  }

}
