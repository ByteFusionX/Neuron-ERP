import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { PurchaseData, ProductPartNumber, QuoteItem, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';
import { ComparisonFormComponent } from '../comparison-form/comparison-form.component';
import { Subscription } from 'rxjs';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ToastrService } from 'ngx-toastr';
import { CreateProductComponent } from 'src/app/modules/inventory/pages/all-products/modals/create-product/create-product.component';

interface PartNumberDropdownOption {
  label: string;
  value: string;
  data: PartNumberOption;
}

@Component({
  selector: 'app-comparison-sheet',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent,
    IconsModule
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.css'
})
export class ComparisonSheetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private purchaseService = inject(PurchaseService)
  private productService = inject(ProductService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private _dialog = inject(MatDialog)
  private subscriptions = new Subscription()
  private toaster = inject(ToastrService)

  purchaseId!: string;
  isSubmitted = signal<boolean>(false);
  purchaseData = signal<PurchaseData | null>(null)
  selectedItemId = signal<string | null>(null)
  comparisonList = signal<any[]>([])
  partNumberOptions = signal<PartNumberDropdownOption[]>([])
  selectedPartNumberId = signal<string>('')
  selectedPartNumberLabel = signal<string>('')
  originalDescription = signal<string>('')
  currency = signal<string>('')

  comparisonForm: FormGroup = this.fb.group({
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    product: [''],
    inventoryList: [[]],
    partNo: ['']
  })

  ngOnInit(): void {
    this.purchaseId = this.route.snapshot.paramMap.get('purchaseId') || '';
    
    if (!this.purchaseId) {
      this.toaster.error('Invalid purchase ID');
      this.router.navigate(['/purchase/pendings']);
      return;
    }

    // Get selected item ID from query params if provided
    const selectedItemId = this.route.snapshot.queryParamMap.get('selectedItem');
    if (selectedItemId) {
      this.selectedItemId.set(selectedItemId);
    }

    this.loadPurchaseData();
  }

  loadPurchaseData(): void {
    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (res) => {
          if (res.data) {
            this.purchaseData.set(res.data);
            if (res.data.currency) {
              this.currency.set(res.data.currency);
            }
            this.initializeForm();
          }
        },
        error: (error) => {
          console.error('Error loading purchase data:', error);
          this.toaster.error('Failed to load purchase data');
          this.router.navigate(['/purchase/pendings']);
        }
      })
    );
  }

  initializeForm(): void {
    const purchase = this.purchaseData();
    if (!purchase) return;

    this.comparisonForm.patchValue({
      purchaseNo: purchase.purchaseNo,
      jobId: purchase.jobId?.jobId || purchase.jobId,
      product: purchase.items,
      partNo: ''
    });

    const items = this.getItem();
    
    // If no item ID is already set, use the first item
    if (!this.selectedItemId()) {
      const firstItem = items[0];
      if (firstItem?._id) {
        this.selectedItemId.set(firstItem._id);
      }
    }

    const currentItem = this.findSelectedItemDetail();
    if (currentItem?.comparisons) {
      this.comparisonList.set(currentItem.comparisons);
    } else {
      this.comparisonList.set([]);
    }

    const partNoId = this.extractPartNumberId(currentItem?.partNo);
    const partLabel = this.getPartNumberLabel(currentItem?.partNo);
    this.selectedPartNumberId.set(partNoId || '');
    this.selectedPartNumberLabel.set(partLabel);
    this.comparisonForm.get('partNo')?.setValue(partNoId || '');
    
    if (currentItem?.detail) {
      this.originalDescription.set(currentItem.detail);
    }

    this.loadPartNumbers();
  }

  onSubmit() {
    const selected = this.comparisonList().some(item => item.selected);

    if (!selected && this.comparisonList().length > 0) {
      this.toaster.error('Please select one comparison!');
      return;
    }

    const purchase = this.purchaseData();
    if (!purchase) return;

    const updatedItems = this.updateComparisonList();
    
    this.subscriptions.add(
      this.purchaseService.updatePurchaseComparisons(this.purchaseId, updatedItems).subscribe({
        next: (res) => {
          if (res.success) {
            this.toaster.success('Comparisons updated successfully');
            this.router.navigate(['/purchase/edit', this.purchaseId]);
          }
        },
        error: (error) => {
          console.error('Error updating comparisons:', error);
          this.toaster.error('Failed to update comparisons');
        }
      })
    );
  }

  onClose() {
    this.router.navigate(['/purchase/edit', this.purchaseId]);
  }

  get f() {
    return this.comparisonForm.controls;
  }

  updateComparisonList(): QuoteItem[] {
    const purchase = this.purchaseData();
    if (!purchase?.items) return [];

    const selectedId = this.selectedItemId();
    const selectedPartNumber = this.getSelectedPartNumberData();
    const selectedDescription = selectedPartNumber?.productDescription;
    const originalDesc = this.originalDescription();
    const hasPartNumber = !!selectedPartNumber;
    
    const comparisonEntries = this.comparisonList().map(entry => ({
      ...entry
    }));

    return purchase.items.map((data: QuoteItem) => {
      const updatedItemDetails = data.itemDetails.map((item: QuoteItemDetails) => {
        const isTarget = selectedId ? item._id === selectedId : false;

        if (item.comparison || isTarget) {
          return {
            ...item,
            comparison: false,
            comparisons: isTarget ? comparisonEntries : (item.comparisons || []),
            detail: isTarget 
              ? (hasPartNumber && selectedDescription ? selectedDescription : (originalDesc || item.detail))
              : item.detail,
            partNo: isTarget
              ? (selectedPartNumber ? { ...selectedPartNumber } : undefined)
              : item.partNo
          };
        }

        return { ...item };
      });

      return {
        ...data,
        itemDetails: updatedItemDetails
      };
    });
  }

  getFormattedProducts(): string {
    const item = this.getItem().find((item: QuoteItemDetails) => item._id === this.selectedItemId());
    if (!item) {
      return '';
    }
    const description = this.getPartNumberDescription(item) || item.detail;
    return description || '';
  }

  getItem() {
    const purchase = this.purchaseData();
    if (!purchase?.items) return [];
    // Return all item details, not just those with comparison flag
    return purchase.items.flatMap((data: QuoteItem) => data.itemDetails || []);
  }

  private findSelectedItemDetail(): QuoteItemDetails | undefined {
    const selectedId = this.selectedItemId();
    const items = this.getItem();

    if (selectedId) {
      return items.find((item: QuoteItemDetails) => item._id === selectedId) || items[0];
    }

    return items[0];
  }

  onComparisonClicks() {
    const selectedItemDetail = this.findSelectedItemDetail();
    const quantity = selectedItemDetail?.quantity || 0;

    const dialog = this._dialog.open(ComparisonFormComponent, {
      width: '500px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false,
      data: {
        itemDetail: selectedItemDetail,
        quantity: quantity,
        currency: this.currency()
      }
    })

    dialog.afterClosed().subscribe((res) => {
      if (res) {
        const updated = [...this.comparisonList()];
        if (updated.length === 0) {
          res.selected = true;
        }
        updated.push(res);
        updated.sort((a, b) => a.unitPrice - b.unitPrice);
        this.comparisonList.set(updated);
      }
    })
  }

  onEditComparison(index: number) {
    const comparison = this.comparisonList()[index];
    if (!comparison) return;

    const selectedItemDetail = this.findSelectedItemDetail();
    const wasSelected = comparison.selected;

    const dialog = this._dialog.open(ComparisonFormComponent, {
      width: '500px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false,
      data: {
        itemDetail: selectedItemDetail,
        existingComparison: comparison,
        isEditMode: true,
        quantity: selectedItemDetail?.quantity || comparison.quantity || 0,
        currency: this.currency()
      }
    })

    dialog.afterClosed().subscribe((res) => {
      if (res) {
        const updated = [...this.comparisonList()];
        updated[index] = {
          ...res,
          selected: wasSelected
        };
        
        updated.sort((a, b) => {
          if (a.selected && !b.selected) return -1;
          if (!a.selected && b.selected) return 1;
          return a.unitPrice - b.unitPrice;
        });
        
        this.comparisonList.set(updated);
      }
    })
  }

  onSelectionChange(index: number): void {
    const comparisonList = this.comparisonList().map((item, i) => ({
      ...item,
      selected: i === index
    }));
    this.comparisonList.set(comparisonList)
  }

  getSelectedComparison() {
    return this.comparisonList().find(item => item.selected) || null;
  }

  onAddSupplier() {
    this.router.navigate(['/suppliers/create']);
  }

  onPartNumberSelected(selection: string | string[]) {
    const value = Array.isArray(selection) ? selection[0] : selection;
    const normalized = (value || '').trim();
    this.selectedPartNumberId.set(normalized);
    const option = this.partNumberOptions().find(opt => opt.value === normalized);
    this.selectedPartNumberLabel.set(option ? option.label : '');
    this.comparisonForm.get('partNo')?.setValue(normalized);
    
    if (!normalized) {
      const originalDesc = this.originalDescription();
      if (originalDesc) {
        this.syncPartNumberWithSelectedItem('', undefined);
      }
    } else {
      this.syncPartNumberWithSelectedItem(normalized, option?.data);
    }
  }

  onCreatePartNumber() {
    const dialogRef = this._dialog.open(CreateProductComponent, {
      width: '650px',
      disableClose: true,
      maxHeight: '90vh',
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.partNo && result?._id) {
        const option: PartNumberDropdownOption = {
          label: this.composePartNumberLabel({
            partNo: result.partNo,
            productDescription: result.productDescription
          }),
          value: result._id,
          data: {
            _id: result._id,
            partNo: result.partNo,
            productDescription: result.productDescription
          }
        };

        const filtered = this.partNumberOptions().filter(opt => opt.value !== option.value);
        this.partNumberOptions.set([option, ...filtered]);
        this.onPartNumberSelected(option.value);
        this.loadPartNumbers();
      }
    });
  }


  onDeleteComparison(index: number) {
    const updated = [...this.comparisonList()];
    updated.splice(index, 1);
    this.comparisonList.set(updated);
  }

  private loadPartNumbers(search?: string) {
    const params: { search?: string; limit?: number } = { limit: 50 };
    if (search) {
      params.search = search;
    }

    this.subscriptions.add(
      this.productService.getPartNumbers(params).subscribe({
        next: (res) => {
          let options = (res.data || []).map((item: PartNumberOption) => ({
            label: this.composePartNumberLabel(item),
            value: item._id,
            data: item
          }));

          const currentId = this.selectedPartNumberId();
          if (currentId && !options.some(option => option.value === currentId)) {
            const fallback = this.buildOptionFromPayload(this.getExistingPartNumberPayload(currentId));
            if (fallback) {
              options = [fallback, ...options];
            }
          }

          this.partNumberOptions.set(options);

          if (currentId) {
            const currentOption = options.find(option => option.value === currentId);
            if (currentOption) {
              this.selectedPartNumberLabel.set(currentOption.label);
            }
          }
        },
        error: (error) => {
          console.log(error);
          this.partNumberOptions.set([]);
        }
      })
    );
  }

  private composePartNumberLabel(option: { partNo?: string; productDescription?: string }) {
    const code = option.partNo || '';
    const description = option.productDescription || '';
    return description ? `${code} (${description})` : code;
  }

  private syncPartNumberWithSelectedItem(partNoId: string, partNumberData?: PartNumberOption | ProductPartNumber) {
    const purchase = this.purchaseData();
    if (!purchase) {
      return;
    }

    const selectedId = this.selectedItemId();
    if (!selectedId) {
      return;
    }

    const payload = partNoId
      ? this.toPartNumberPayload(partNumberData) || this.getExistingPartNumberPayload(partNoId)
      : undefined;

    const originalDesc = this.originalDescription();
    const hasPartNumber = !!payload;
    const newDescription = hasPartNumber && payload?.productDescription 
      ? payload.productDescription 
      : (originalDesc || '');

    const updatedItems = (purchase.items || []).map((item: QuoteItem) => ({
      ...item,
      itemDetails: item.itemDetails.map(detail => {
        const matches = detail._id === selectedId;
        if (matches) {
          const currentDetail = detail.detail;
          if (!originalDesc && currentDetail) {
            this.originalDescription.set(currentDetail);
          }
          
          return {
            ...detail,
            partNo: payload ? { ...payload } : undefined,
            detail: hasPartNumber && payload?.productDescription 
              ? payload.productDescription 
              : (originalDesc || currentDetail || detail.detail)
          };
        }
        return detail;
      })
    }));

    const updatedPurchase = { ...purchase, items: updatedItems };
    this.purchaseData.set(updatedPurchase);
    this.f['product'].setValue(updatedItems);
  }

  private extractPartNumberId(partNo: string | ProductPartNumber | undefined): string {
    if (!partNo) return '';
    if (typeof partNo === 'string') {
      return partNo;
    }
    return partNo._id || '';
  }

  private getPartNumberLabel(partNo: string | ProductPartNumber | undefined): string {
    if (!partNo) return '';
    if (typeof partNo === 'string') {
      const option = this.partNumberOptions().find(opt => opt.value === partNo);
      return option ? option.label : partNo;
    }
    const code = partNo.partNo || '';
    const description = partNo.productDescription || '';
    return description ? `${code} (${description})` : code;
  }

  private toPartNumberPayload(source?: PartNumberOption | ProductPartNumber): ProductPartNumber | undefined {
    if (!source) return undefined;
    return {
      _id: source._id,
      partNo: source.partNo,
      productDescription: source.productDescription
    };
  }

  private getExistingPartNumberPayload(partNoId?: string): ProductPartNumber | undefined {
    if (!partNoId) return undefined;
    const item = this.findSelectedItemDetail();
    const partNo = item?.partNo;
    if (partNo && typeof partNo === 'object' && partNo._id === partNoId) {
      return partNo;
    }
    return undefined;
  }

  private buildOptionFromPayload(payload?: ProductPartNumber): PartNumberDropdownOption | undefined {
    if (!payload) return undefined;
    return {
      label: this.composePartNumberLabel(payload),
      value: payload._id,
      data: payload
    };
  }

  private getSelectedPartNumberData(): ProductPartNumber | undefined {
    const selectedId = this.selectedPartNumberId();
    if (!selectedId) return undefined;
    const option = this.partNumberOptions().find(opt => opt.value === selectedId);
    if (option) {
      return this.toPartNumberPayload(option.data);
    }
    return this.getExistingPartNumberPayload(selectedId);
  }

  private getPartNumberDescription(detail: QuoteItemDetails | undefined): string {
    if (!detail) {
      return '';
    }

    const part = detail.partNo;
    if (!part) {
      return '';
    }

    if (typeof part === 'string') {
      const existing = this.partNumberOptions().find(opt => opt.value === part);
      return existing?.data?.productDescription || '';
    }

    return part.productDescription || '';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
  }
}
