import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';

@Component({
    selector: 'optional-items',
    templateUrl: './optional-items.component.html',
    styleUrls: ['./optional-items.component.css'],
    standalone: false
})
export class OptionalItemsComponent implements OnInit {

  @Input() optionalItems!: FormArray;
  @Input() submit!: boolean;
  @Input() oldOptionalItems!: any;
  @Output() calculatedValues = new EventEmitter<{ totalCost: number, sellingPrice: number, totalProfit: number, discount: number }>();

  selectedOption: number = 0;

  removedItems: any[] = [];
  removedItemDetails: any[] = [];
  availabilityDefaultOptions: string[] = [
    "Ex-Stock",
    "Ex-Stock (Subject to Prior Sale)",
    "6-8 Weeks",
    "2-3 Weeks",
    "4-6 Weeks"
  ];
  availabiltyInput$ = new Subject<string>();
  removedOptions: any[] = [];

  constructor(
    private _fb: FormBuilder,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit() {
    this.addOptionalItem()
    if (this.oldOptionalItems && this.oldOptionalItems.length) {
      this.patchOptionalItems()
    }
    this.optionalItems.valueChanges.subscribe(() => {
      this.emitCalculatedValues();
    });
  }

  patchOptionalItems() {
    this.optionalItems.clear();
    this.oldOptionalItems.forEach((optionItem: any, optionIndex: number) => {
      this.addOptionalItem();
      optionItem.items.forEach((item: any, itemIndex: number) => {
        if (itemIndex > 0) {
          this.addItemFormGroup(optionIndex);
        }
        item.itemDetails.forEach((detail: any, ind: number) => {
          if (ind > 0) {
            this.addItemDetail(optionIndex, itemIndex);
          }
          // Calculate unitPrice and add it to itemDetails
          const decimalMargin = detail.profit / 100 || 0;
          const unitPrice = detail.unitCost / (1 - decimalMargin) || 0;
          detail.unitPrice = Number(unitPrice.toFixed(2));
        });
      });
    });

    this.optionalItems.patchValue(this.oldOptionalItems);
    this.emitCalculatedValues();
  }

  onCalculationOptionChange() {
    this.emitCalculatedValues()
  }

  private emitCalculatedValues() {
    const totalCost = this.calculateAllTotalCost();
    const sellingPrice = this.calculateSellingPrice();
    const totalProfit = this.calculateTotalProfit();
    const discount = this.calculateDiscount();

    this.calculatedValues.emit({ totalCost, sellingPrice, totalProfit, discount });
  }

  get parentFormGroup(): FormGroup {
    return this.optionalItems.parent as FormGroup;
  }

  getItemAtOption(index: number): FormArray {
    return this.optionalItems.at(index).get('items') as FormArray;
  }

  getItemDetailsArrayControls(i: number, j: number): FormArray | null {
    const itemAtOption = this.getItemAtOption(i);
    if (itemAtOption instanceof FormArray) {
      const atJ = itemAtOption.at(j)
      if (atJ instanceof FormGroup) {
        const itemDetails = atJ.get('itemDetails') as FormArray;
        return itemDetails
      }
    }

    return null
  }

  addOptionalItem() {
    this.optionalItems.push(this._fb.group({
      items: this._fb.array([
        this._fb.group({
          itemName: ['', Validators.required],
          itemDetails: this._fb.array([
            this._fb.group({
              detail: ['', Validators.required],
              quantity: ['', Validators.required],
              unitCost: ['', Validators.required],
              profit: ['', [Validators.required, this.nonNegativeProfitValidator()]],
              unitPrice: ['', Validators.required],
              availability: ['', Validators.required],
            }),
          ])
        })
      ]),
      totalDiscount: [0, Validators.required]
    }
    ),
    )

  }

  addItemFormGroup(index: number) {
    this.getItemAtOption(index).push(
      this._fb.group({
        itemName: ['', Validators.required],
        itemDetails: this._fb.array([
          this._fb.group({
            detail: ['', Validators.required],
            quantity: ['', Validators.required],
            unitCost: ['', Validators.required],
            profit: ['', Validators.required],
            unitPrice: [''],
            availability: ['', Validators.required],
          })
        ])
      })
    )
  }

  createItemDetail(): FormGroup {
    return this._fb.group({
      detail: ['', Validators.required],
      quantity: ['', Validators.required],
      unitCost: ['', Validators.required],
      profit: ['', Validators.required],
      unitPrice: [''],
      availability: ['', Validators.required]
    });
  }

  addItemDetail(i: number, j: number): void {
    this.getItemDetailsArrayControls(i, j)?.push(this.createItemDetail());
  }

  removeOptions(i: number): void {
    const removedOption = this.optionalItems.at(i).value;
    this.removedOptions.push({ option: removedOption, i });
    this.optionalItems.removeAt(i);

    this.showUndoOption('option');
  }

  onRemoveItem(i: number, j: number): void {
    const removedItem = ((this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray)?.at(j).value;
    this.removedItems.push({ item: removedItem, i, j });
    ((this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray)?.removeAt(j)

    this.showUndoOption('item');
  }

  onRemoveItemDetail(i: number, j: number, k: number): void {
    const removedItemDetail = this.getItemDetailsArrayControls(i, j)?.at(k).value;
    this.removedItemDetails.push({ item: removedItemDetail, i, j, k });
    this.getItemDetailsArrayControls(i, j)?.removeAt(k);

    this.showUndoOption('item detail');
  }

  undoRemoveItem(): void {
    if (this.removedItems.length > 0) {
      const { item, i, j } = this.removedItems.pop();
      ((this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray)?.insert(j, this._fb.group({

        itemName: item.itemName,
        itemDetails: this._fb.array(
          item.itemDetails.map((detail: any) =>
            this._fb.group({
              detail: detail.detail,
              quantity: detail.quantity,
              unitCost: detail.unitCost,
              profit: detail.profit,
              unitPrice: detail.unitPrice,
              availability: detail.availability,
            })
          )
        ),
      }));
      (this.optionalItems.at(i) as FormArray)?.updateValueAndValidity();
    }
  }

  undoRemoveItemDetail(): void {
    if (this.removedItemDetails.length > 0) {
      const { item, i, j, k } = this.removedItemDetails.pop();
      const itemDetailsArray = this.getItemDetailsArrayControls(i, j);
      itemDetailsArray?.insert(k, this._fb.group({
        detail: item.detail,
        quantity: item.quantity,
        unitCost: item.unitCost,
        profit: item.profit,
        unitPrice: item.unitPrice,
        availability: item.availability,
      }));
      itemDetailsArray?.updateValueAndValidity();
    }
  }

  undoRemoveOptions(): void {
    if (this.removedOptions.length > 0) {  
      const { option, i } = this.removedOptions.pop();
      const optionGroup = this._fb.group({
        items: this._fb.array(
          option.items.map((item: any) =>
            this._fb.group({
              itemName: [item.itemName, Validators.required],
              itemDetails: this._fb.array(
                item.itemDetails.map((detail: any) =>
                  this._fb.group({
                    detail: [detail.detail, Validators.required],
                    quantity: [detail.quantity, Validators.required],
                    unitCost: [detail.unitCost, Validators.required],
                    profit: [detail.profit, Validators.required],
                    unitPrice: [detail.unitPrice, Validators.required],
                    availability: [detail.availability, Validators.required],
                  })
                )
              ),
            })
          )
        ),
        totalDiscount: [option.totalDiscount, Validators.required]
      });

      this.optionalItems.insert(i, optionGroup);
      this.optionalItems.updateValueAndValidity();
    }
  }

  showUndoOption(type: string): void {
    const snackBarRef = this.snackBar.open(`Item removed. Undo?`, 'Undo', { duration: 3000 });

    snackBarRef.onAction().subscribe(() => {
      if (type === 'item') {
        this.undoRemoveItem();
      } else if (type === 'item detail') {
        this.undoRemoveItemDetail();
      } else if (type === 'option') {
        this.undoRemoveOptions();
      }
    });
  }

  // @params
  // i → optionalItemIndex
  // j → itemIndex
  // k → itemDetailIndex

  calculateTotalCost(i: number, j: number, k: number) {
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[k] as FormControl;
    return (
      itemDetail.get('quantity')?.value * itemDetail.get('unitCost')?.value || 0
    );
  }

  calculateUnitPrice(i: number, j: number, k: number) {
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[k] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    return itemDetail.get('unitCost')?.value / (1 - decimalMargin) || 0;
  }

  calculateUnitPriceForInput(i: number, j: number, k: number) {
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[k] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    const unitPrice = itemDetail.get('unitCost')?.value / (1 - decimalMargin) || 0;
    itemDetail.get('unitPrice')?.setValue(Number(unitPrice.toFixed(2)));
  }

  calculateProfit(i: number, j: number, k: number) {
    const unitCost = this.getItemDetailsArrayControls(i, j)?.controls[k].get('unitCost')?.value;
    const unitPrice = this.getItemDetailsArrayControls(i, j)?.controls[k].get('unitPrice')?.value;
    if (unitCost && unitPrice) {
      const profit = ((unitPrice - unitCost) / unitPrice) * 100;
      this.getItemDetailsArrayControls(i, j)?.controls[k].get('profit')?.setValue(profit.toFixed(4));
    } else if (unitCost) {
      this.getItemDetailsArrayControls(i, j)?.controls[k].get('profit')?.setValue('');
    }
  }

  calculateTotalPrice(i: number, j: number, k: number) {
    return (
      this.calculateUnitPrice(i, j, k) *
      this.getItemDetailsArrayControls(i, j)?.controls[k].get('quantity')?.value || 0
    );
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.optionalItems.value[this.selectedOption].items.forEach((item: any, j: number) => {
      item.itemDetails.forEach((_: any, k: number) => {
        totalCost += this.calculateTotalCost(this.selectedOption, j, k);
      });
    });

    return totalCost;
  }

  calculateSellingPrice() {
    let totalSellingPrice = 0;
    this.optionalItems.value[this.selectedOption].items.forEach((item: any, j: number) => {
      item.itemDetails.forEach((_: any, k: number) => {
        totalSellingPrice += this.calculateTotalPrice(this.selectedOption, j, k);
      });
    });

    return totalSellingPrice;
  }

  calculateTotalProfit() {
    const sellingPrice = this.calculateSellingPrice() - this.optionalItems.value[this.selectedOption].totalDiscount ;
    const totalCost = this.calculateAllTotalCost();
    return sellingPrice > 0
      ? ((sellingPrice - totalCost) / sellingPrice) * 100
      : 0;
  }

  calculateDiscount() {
    return this.optionalItems.value[this.selectedOption].totalDiscount || 0
  }



  applyFormatting(i: number, j: number, k: number, textarea: HTMLTextAreaElement): void {
    const control = this.getItemDetailsArrayControls(i, j)?.controls[k].get('detail') as FormControl;
    let currentValue = control.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionStart === selectionEnd) return;

    const selectedText = currentValue.substring(selectionStart, selectionEnd);

    const isBold = /^\*{2}.*\*{2}$/.test(selectedText);

    let newText: string;
    if (isBold) {
      newText = currentValue.substring(0, selectionStart) + selectedText.substring(2, selectedText.length - 2) + currentValue.substring(selectionEnd);
    } else {
      const escapedText = selectedText.replace(/\\/g, '\\\\');
      const formattedText = `**${escapedText}**`.replace(/\n/g, ' ');
      newText = currentValue.substring(0, selectionStart) + formattedText + currentValue.substring(selectionEnd);
    }

    control.setValue(newText);
  }

  applyHighlighter(i: number, j: number, k: number, textarea: HTMLTextAreaElement): void {
    const control = this.getItemDetailsArrayControls(i, j)?.controls[k].get('detail') as FormControl;
    let currentValue = control.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionStart === selectionEnd) return;

    const selectedText = currentValue.substring(selectionStart, selectionEnd);

    const isBold = /^\{.*\}$/.test(selectedText);

    let newText: string;
    if (isBold) {
      newText = currentValue.substring(0, selectionStart) + selectedText.substring(1, selectedText.length - 1) + currentValue.substring(selectionEnd);
    } else {
      const escapedText = selectedText.replace(/\\/g, '\\\\');
      const formattedText = `{${escapedText}}`.replace(/\n/g, ' ');
      newText = currentValue.substring(0, selectionStart) + formattedText + currentValue.substring(selectionEnd);
    }

    control.setValue(newText);
  }

  nonNegativeProfitValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      return value < 0 ? { negativeProfit: true } : null;
    };
  }
}
