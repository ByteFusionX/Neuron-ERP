import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { NgFor, NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { NgSelectComponent, NgFooterTemplateDirective } from '@ng-select/ng-select';
import { RouterLink } from '@angular/router';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { appNoNegativeNumber } from '../../directives/no-negative-number.directive';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { QuoteItem } from '../../interfaces/quotation.interface';

@Component({
  selector: 'optional-items',
  templateUrl: './optional-items.component.html',
  styleUrls: ['./optional-items.component.css'],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgFor,
    NgIf,
    NgIcon,
    NgSelectComponent,
    NgFooterTemplateDirective,
    RouterLink,
    appNoNegativeNumber,
    DragDropModule,
  ],
})
export class OptionalItemsComponent implements OnInit {
  @Input() optionalItems!: FormArray;
  @Input() submit!: boolean;
  @Input() oldOptionalItems!: any;
  @Input() disabled: boolean = false;
  @Output() calculatedValues = new EventEmitter<{
    totalCost: number;
    sellingPrice: number;
    totalProfit: number;
    discount: number;
  }>();
  @Output() addNewSupplierClicked = new EventEmitter<Event>();

  onAddNewSupplierClick(event: Event, supplierSelect?: NgSelectComponent) {
    event.preventDefault();
    supplierSelect?.close();
    this.addNewSupplierClicked.emit(event);
  }

  selectedOption: number = 0;
  removedItems: any[] = [];
  removedItemDetails: any[] = [];
  availabilityDefaultOptions: string[] = [
    'Ex-Stock',
    'Ex-Stock (Subject to Prior Sale)',
    '6-8 Weeks',
    '2-3 Weeks',
    '4-6 Weeks',
  ];
  availabiltyInput$ = new Subject<string>();
  removedOptions: any[] = [];
  suppliers: { _id: string; supplierName: string }[] = [];
  activeBoldSelections: Record<string, boolean> = {};
  activeHighlightSelections: Record<string, boolean> = {};

  constructor(
    private _fb: FormBuilder,
    private snackBar: MatSnackBar,
    private _supplierService: SupplierService,
  ) {}

  ngOnInit() {
    this.addOptionalItem();
    if (this.oldOptionalItems && this.oldOptionalItems.length) {
      this.patchOptionalItems();
    }
    this.optionalItems.valueChanges.subscribe(() => {
      this.emitCalculatedValues();
    });
    this._supplierService.supplierList().subscribe({
      next: (res) => {
        this.suppliers = res?.data || [];
      },
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
          const unitCost = detail.unitCost;
          const unitSellingPrice = detail.unitSellingPrice;

          if (unitCost && unitSellingPrice) {
            detail.profit = (
              ((unitSellingPrice - unitCost) / unitSellingPrice) *
              100
            ).toFixed(2);
          }
        });
      });
    });

    this.optionalItems.patchValue(this.oldOptionalItems);
    this.emitCalculatedValues();
  }

  onCalculationOptionChange() {
    this.emitCalculatedValues();
  }

  private emitCalculatedValues() {
    const totalCost = this.calculateAllTotalCost();
    const sellingPrice = this.calculateSellingPrice();
    const totalProfit = this.calculateTotalProfit();
    const discount = this.calculateDiscount();

    this.calculatedValues.emit({
      totalCost,
      sellingPrice,
      totalProfit,
      discount,
    });
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
      const atJ = itemAtOption.at(j);
      if (atJ instanceof FormGroup) {
        const itemDetails = atJ.get('itemDetails') as FormArray;
        return itemDetails;
      }
    }

    return null;
  }

  addOptionalItem() {
    this.optionalItems.push(
      this._fb.group({
        items: this._fb.array([
          this._fb.group({
            itemName: ['', Validators.required],
            isOptional: [false],
            includeInTotal: [false],
            itemDetails: this._fb.array([
              this._fb.group({
                detail: ['', Validators.required],
                quantity: ['', [Validators.required, Validators.min(0)]],
                unitCost: ['', [Validators.required, Validators.min(0)]],
                profit: [
                  '',
                  [
                    Validators.required,
                    Validators.min(0),
                    this.nonNegativeProfitValidator(),
                  ],
                ],
                unitSellingPrice: [
                  '',
                  [Validators.required, Validators.min(0)],
                ],
                availability: ['', Validators.required],
                supplierId: [''],
                uom: [''],
              }),
            ]),
          }),
        ]),
        totalDiscount: ['', [Validators.min(0)]],
      }),
    );
  }

  addItemFormGroup(index: number, isOptional: boolean = false) {
    this.getItemAtOption(index).push(
      this._fb.group({
        itemName: ['', Validators.required],
        isOptional: [isOptional],
        includeInTotal: [false],
        itemDetails: this._fb.array([
          this._fb.group({
            detail: ['', Validators.required],
            quantity: ['', [Validators.required, Validators.min(0)]],
            unitCost: ['', [Validators.required, Validators.min(0)]],
            profit: ['', [Validators.required, Validators.min(0)]],
            unitSellingPrice: ['', Validators.min(0)],
            availability: ['', Validators.required],
            supplierId: [''],
            uom: [''],
          }),
        ]),
      }),
    );
  }

  createItemDetail(): FormGroup {
    return this._fb.group({
      detail: ['', Validators.required],
      quantity: ['', [Validators.required, Validators.min(0)]],
      unitCost: ['', [Validators.required, Validators.min(0)]],
      profit: ['', [Validators.required, Validators.min(0)]],
      unitSellingPrice: ['', Validators.min(0)],
      availability: ['', Validators.required],
      supplierId: [''],
      uom: [''],
    });
  }

  addItemDetail(i: number, j: number): void {
    this.getItemDetailsArrayControls(i, j)?.push(this.createItemDetail());
  }

  private isItemGroupEmpty(itemGroup: FormGroup): boolean {
    const itemName = (itemGroup.get('itemName')?.value || '').toString().trim();
    if (itemName) {
      return false;
    }
    const itemDetailsArray = itemGroup.get('itemDetails') as FormArray;
    return !itemDetailsArray?.controls.some((detail) => {
      const detailValue = (detail.get('detail')?.value || '').toString().trim();
      const quantity = detail.get('quantity')?.value;
      const unitCost = detail.get('unitCost')?.value;
      return !!detailValue || !!quantity || !!unitCost;
    });
  }

  addItemsFromPreviousJobs(items: QuoteItem[]): void {
    if (!items?.length) {
      return;
    }
    const optionIndex = this.selectedOption ?? 0;

    items.forEach((item) => {
      const itemsArray = this.getItemAtOption(optionIndex);
      const firstItemGroup =
        itemsArray.length > 0 ? (itemsArray.at(0) as FormGroup) : null;

      let newItemGroup: FormGroup;
      if (firstItemGroup && this.isItemGroupEmpty(firstItemGroup)) {
        newItemGroup = firstItemGroup;
      } else {
        this.addItemFormGroup(optionIndex, false);
        newItemGroup = itemsArray.at(itemsArray.length - 1) as FormGroup;
      }
      newItemGroup.get('itemName')?.setValue(item.itemName);

      const itemDetailsArray = newItemGroup.get('itemDetails') as FormArray;
      (item.itemDetails || []).forEach((detail: any, index: number) => {
        if (index > 0) {
          itemDetailsArray.push(this.createItemDetail());
        }
        const unitCost = detail.unitCost;
        const unitSellingPrice = detail.unitSellingPrice;
        const profit =
          unitCost && unitSellingPrice
            ? (((unitSellingPrice - unitCost) / unitSellingPrice) * 100).toFixed(2)
            : '';

        itemDetailsArray.at(index).patchValue({
          detail: detail.detail,
          quantity: detail.quantity,
          unitCost: detail.unitCost,
          profit,
          unitSellingPrice: detail.unitSellingPrice,
          availability: detail.availability,
          supplierId: detail.supplierId,
          uom: detail.uom,
        });
      });
    });

    this.emitCalculatedValues();
  }

  removeOptions(i: number): void {
    const removedOption = this.optionalItems.at(i).value;
    this.removedOptions.push({ option: removedOption, i });
    this.optionalItems.removeAt(i);

    this.showUndoOption('option');
  }

  onRemoveItem(i: number, j: number): void {
    const removedItem = (
      (this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray
    )?.at(j).value;
    this.removedItems.push({ item: removedItem, i, j });
    (
      (this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray
    )?.removeAt(j);
    this.clearFormattingActiveStateForOption(i);

    this.showUndoOption('item');
  }

  dropItemDetail(event: CdkDragDrop<AbstractControl[] | undefined>, i: number, j: number): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const itemDetailsArray = this.getItemDetailsArrayControls(i, j);
    if (!itemDetailsArray) {
      return;
    }
    moveItemInArray(
      itemDetailsArray.controls,
      event.previousIndex,
      event.currentIndex,
    );
    itemDetailsArray.updateValueAndValidity();
    itemDetailsArray.markAsDirty();
    itemDetailsArray.markAsTouched();
    this.clearFormattingActiveState(i, j);
    this.emitCalculatedValues();
  }

  private clearFormattingActiveStateForOption(i: number): void {
    const prefix = `${i}-`;
    for (const key of Object.keys(this.activeBoldSelections)) {
      if (key.startsWith(prefix)) {
        delete this.activeBoldSelections[key];
      }
    }
    for (const key of Object.keys(this.activeHighlightSelections)) {
      if (key.startsWith(prefix)) {
        delete this.activeHighlightSelections[key];
      }
    }
  }

  private clearFormattingActiveState(i: number, j: number): void {
    const prefix = `${i}-${j}-`;
    for (const key of Object.keys(this.activeBoldSelections)) {
      if (key.startsWith(prefix)) {
        delete this.activeBoldSelections[key];
      }
    }
    for (const key of Object.keys(this.activeHighlightSelections)) {
      if (key.startsWith(prefix)) {
        delete this.activeHighlightSelections[key];
      }
    }
  }

  isItemDetailFilled(i: number, j: number, k: number): boolean {
    const detailGroup = this.getItemDetailsArrayControls(i, j)?.at(k) as FormGroup;
    if (!detailGroup) {
      return false;
    }
    const rawValue = detailGroup.getRawValue() || {};
    return Object.keys(rawValue).some((key) => {
      const value = rawValue[key];
      return value !== null && value !== undefined && value.toString().trim() !== '';
    });
  }

  onClearItemDetail(i: number, j: number, k: number): void {
    const detailGroup = this.getItemDetailsArrayControls(i, j)?.at(k) as FormGroup;
    if (!detailGroup) {
      return;
    }
    detailGroup.reset({
      detail: '',
      quantity: '',
      unitCost: '',
      profit: '',
      unitSellingPrice: '',
      availability: '',
      supplierId: '',
      uom: '',
    });
    this.emitCalculatedValues();
  }

  onRemoveItemDetail(i: number, j: number, k: number): void {
    const removedItemDetail = this.getItemDetailsArrayControls(i, j)?.at(
      k,
    ).value;
    this.removedItemDetails.push({ item: removedItemDetail, i, j, k });
    this.getItemDetailsArrayControls(i, j)?.removeAt(k);
    this.clearFormattingActiveState(i, j);

    this.showUndoOption('item detail');
  }

  undoRemoveItem(): void {
    if (this.removedItems.length > 0) {
      const { item, i, j } = this.removedItems.pop();
      (
        (this.optionalItems.at(i) as FormGroup)?.get('items') as FormArray
      )?.insert(
        j,
        this._fb.group({
          itemName: item.itemName,
          isOptional: item.isOptional ?? false,
          includeInTotal: item.includeInTotal ?? false,
          itemDetails: this._fb.array(
            item.itemDetails.map((detail: any) =>
              this._fb.group({
                detail: detail.detail,
                quantity: detail.quantity,
                unitCost: detail.unitCost,
                profit: detail.profit,
                unitSellingPrice: detail.unitSellingPrice,
                availability: detail.availability,
                supplierId: detail.supplierId,
                uom: detail.uom,
              }),
            ),
          ),
        }),
      );
      (this.optionalItems.at(i) as FormArray)?.updateValueAndValidity();
    }
  }

  undoRemoveItemDetail(): void {
    if (this.removedItemDetails.length > 0) {
      const { item, i, j, k } = this.removedItemDetails.pop();
      const itemDetailsArray = this.getItemDetailsArrayControls(i, j);
      itemDetailsArray?.insert(
        k,
        this._fb.group({
          detail: item.detail,
          quantity: item.quantity,
          unitCost: item.unitCost,
          profit: item.profit,
          unitSellingPrice: item.unitSellingPrice,
          availability: item.availability,
          supplierId: item.supplierId,
          uom: item.uom,
        }),
      );
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
              isOptional: [item.isOptional ?? false],
              includeInTotal: [item.includeInTotal ?? false],
              itemDetails: this._fb.array(
                item.itemDetails.map((detail: any) =>
                  this._fb.group({
                    detail: [detail.detail, Validators.required],
                    quantity: [detail.quantity, Validators.required],
                    unitCost: [detail.unitCost, Validators.required],
                    profit: [detail.profit, Validators.required],
                    unitSellingPrice: [
                      detail.unitSellingPrice,
                      Validators.required,
                    ],
                    availability: [detail.availability, Validators.required],
                    supplierId: [detail.supplierId],
                    uom: [detail.uom],
                  }),
                ),
              ),
            }),
          ),
        ),
        totalDiscount: [option.totalDiscount ?? 0, [Validators.min(0)]],
      });

      this.optionalItems.insert(i, optionGroup);
      this.optionalItems.updateValueAndValidity();
    }
  }

  showUndoOption(type: string): void {
    const snackBarRef = this.snackBar.open(`Item removed. Undo?`, 'Undo', {
      duration: 3000,
    });

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
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[
      k
    ] as FormControl;
    return (
      itemDetail.get('quantity')?.value * itemDetail.get('unitCost')?.value || 0
    );
  }

  calculateunitSellingPrice(i: number, j: number, k: number) {
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[
      k
    ] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    const unitSellingPrice = Math.ceil(
      Number(
        (itemDetail.get('unitCost')?.value / (1 - decimalMargin)).toFixed(2),
      ) || 0,
    );
    return unitSellingPrice;
  }

  calculateunitSellingPriceForInput(i: number, j: number, k: number) {
    const itemDetail = this.getItemDetailsArrayControls(i, j)?.controls[
      k
    ] as FormControl;
    const decimalMargin = itemDetail.get('profit')?.value / 100 || 0;
    const unitSellingPrice =
      Number(
        (itemDetail.get('unitCost')?.value / (1 - decimalMargin)).toFixed(2),
      ) || 0;
    itemDetail
      .get('unitSellingPrice')
      ?.setValue(Number(Math.ceil(unitSellingPrice)).toFixed(2));
  }

  calculateProfit(i: number, j: number, k: number) {
    const unitCost = this.getItemDetailsArrayControls(i, j)?.controls[k].get(
      'unitCost',
    )?.value;
    const unitSellingPrice = this.getItemDetailsArrayControls(i, j)?.controls[
      k
    ].get('unitSellingPrice')?.value;
    if (unitCost && unitSellingPrice) {
      const profit = ((unitSellingPrice - unitCost) / unitSellingPrice) * 100;
      this.getItemDetailsArrayControls(i, j)
        ?.controls[k].get('profit')
        ?.setValue(profit.toFixed(2));
    } else if (unitCost) {
      this.getItemDetailsArrayControls(i, j)
        ?.controls[k].get('profit')
        ?.setValue('');
    }
  }

  calculateTotalPrice(i: number, j: number, k: number) {
    return (
      this.getItemDetailsArrayControls(i, j)?.controls[k].get(
        'unitSellingPrice',
      )?.value *
        this.getItemDetailsArrayControls(i, j)?.controls[k].get('quantity')
          ?.value || 0
    );
  }

  calculateAllTotalCost() {
    let totalCost = 0;
    this.optionalItems.value[this.selectedOption].items.forEach(
      (item: any, j: number) => {
        if (item.isOptional && !item.includeInTotal) {
          return;
        }
        item.itemDetails.forEach((_: any, k: number) => {
          totalCost += this.calculateTotalCost(this.selectedOption, j, k);
        });
      },
    );

    return totalCost;
  }

  calculateSellingPrice() {
    let totalSellingPrice = 0;
    this.optionalItems.value[this.selectedOption].items.forEach(
      (item: any, j: number) => {
        if (item.isOptional && !item.includeInTotal) {
          return;
        }
        item.itemDetails.forEach((_: any, k: number) => {
          totalSellingPrice += this.calculateTotalPrice(
            this.selectedOption,
            j,
            k,
          );
        });
      },
    );

    return totalSellingPrice;
  }

  calculateTotalProfit() {
    const sellingPrice =
      this.calculateSellingPrice() -
      this.optionalItems.value[this.selectedOption].totalDiscount;
    const totalCost = this.calculateAllTotalCost();
    return sellingPrice > 0
      ? ((sellingPrice - totalCost) / sellingPrice) * 100
      : 0;
  }

  calculateDiscount() {
    return this.optionalItems.value[this.selectedOption].totalDiscount || 0;
  }

  applyFormatting(
    i: number,
    j: number,
    k: number,
    textarea: HTMLTextAreaElement,
  ): void {
    const control = this.getItemDetailsArrayControls(i, j)?.controls[k].get(
      'detail',
    ) as FormControl;
    let currentValue = control.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionStart === selectionEnd) return;

    const selectedText = currentValue.substring(selectionStart, selectionEnd);

    const isBold = /^\*{2}.*\*{2}$/.test(selectedText);

    let newText: string;
    if (isBold) {
      newText =
        currentValue.substring(0, selectionStart) +
        selectedText.substring(2, selectedText.length - 2) +
        currentValue.substring(selectionEnd);
    } else {
      const escapedText = selectedText.replace(/\\/g, '\\\\');
      const formattedText = `**${escapedText}**`.replace(/\n/g, ' ');
      newText =
        currentValue.substring(0, selectionStart) +
        formattedText +
        currentValue.substring(selectionEnd);
    }

    control.setValue(newText);
    this.activeBoldSelections[`${i}-${j}-${k}`] = !isBold;
  }

  isBoldActive(i: number, j: number, k: number): boolean {
    return !!this.activeBoldSelections[`${i}-${j}-${k}`];
  }

  isHighlightActive(i: number, j: number, k: number): boolean {
    return !!this.activeHighlightSelections[`${i}-${j}-${k}`];
  }

  applyHighlighter(
    i: number,
    j: number,
    k: number,
    textarea: HTMLTextAreaElement,
  ): void {
    const control = this.getItemDetailsArrayControls(i, j)?.controls[k].get(
      'detail',
    ) as FormControl;
    let currentValue = control.value;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionStart === selectionEnd) return;

    const selectedText = currentValue.substring(selectionStart, selectionEnd);

    const isHighlighted = /^\{.*\}$/.test(selectedText);

    let newText: string;
    if (isHighlighted) {
      newText =
        currentValue.substring(0, selectionStart) +
        selectedText.substring(1, selectedText.length - 1) +
        currentValue.substring(selectionEnd);
    } else {
      const escapedText = selectedText.replace(/\\/g, '\\\\');
      const formattedText = `{${escapedText}}`.replace(/\n/g, ' ');
      newText =
        currentValue.substring(0, selectionStart) +
        formattedText +
        currentValue.substring(selectionEnd);
    }

    control.setValue(newText);
    this.activeHighlightSelections[`${i}-${j}-${k}`] = !isHighlighted;
  }

  nonNegativeProfitValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      return value < 0 ? { negativeProfit: true } : null;
    };
  }
}
