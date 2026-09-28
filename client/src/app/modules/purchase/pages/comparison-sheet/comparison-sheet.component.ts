import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, computed, EventEmitter, HostBinding, inject, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { ProductService, PartNumberOption } from 'src/app/core/services/product/product.service';
import { PurchaseData, ProductPartNumber, QuoteItem, QuoteItemDetails } from 'src/app/shared/interfaces/purchase.interface';
import { ComparisonFormComponent } from '../comparison-form/comparison-form.component';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ProductFormDrawerComponent } from 'src/app/modules/products/pages/product-form-drawer/product-form-drawer.component';
import { ModalService } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailBadgeComponent } from 'src/app/shared/components/detail-panel/detail-badge.component';
import { DetailCalloutComponent } from 'src/app/shared/components/detail-panel/detail-callout.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import {
  DetailViewBreadcrumb,
  DetailViewShellComponent,
  DetailViewStat,
} from 'src/app/shared/components/detail-view-shell/detail-view-shell.component';

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
    ProductFormDrawerComponent,
    SmartFormModule,
    DetailViewShellComponent,
    ActionButtonComponent,
    DetailBadgeComponent,
    DetailCalloutComponent,
    DetailPanelIconComponent,
  ],
  templateUrl: './comparison-sheet.component.html',
  styleUrl: './comparison-sheet.component.css'
})
export class ComparisonSheetComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Renders the comparison sheet in a slide-over instead of as a page, stacked above the create/edit PR drawer. */
  @Input() drawer = false;
  /** Drawer mode: the PR to compare against (replaces the `purchaseId` route param). */
  @Input() purchaseIdInput: string | null = null;
  /** Drawer mode: the item being compared (replaces the `selectedItem` query param). */
  @Input() selectedItemIdInput: string | null = null;
  /** Drawer mode: comparisons were saved, so the host drawer should refresh its data. */
  @Output() saved = new EventEmitter<void>();
  /** Drawer mode: the slide-out animation finished; the host can unmount. */
  @Output() closed = new EventEmitter<void>();

  @HostBinding('style.display') get hostDisplay(): string | null {
    return this.drawer ? 'contents' : null;
  }

  private fb = inject(FormBuilder);
  private purchaseService = inject(PurchaseService)
  private productService = inject(ProductService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private modal = inject(ModalService)
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

  breadcrumbs = computed<DetailViewBreadcrumb[]>(() => [
    { label: 'Home', link: '/' },
    { label: 'PR', link: '/purchase/pr' },
    { label: this.purchaseData()?.purchaseNo || 'Purchase', link: ['/purchase/edit', this.purchaseId] },
    { label: 'Comparison sheet' },
  ]);

  subtitle = computed(() => {
    const p: any = this.purchaseData();
    const jobId = p?.jobId?.jobId || (typeof p?.jobId === 'string' ? p.jobId : '');
    return [p?.purchaseNo, jobId ? `Job ${jobId}` : ''].filter(Boolean).join(' · ');
  });

  selectedQuantity = computed(() => {
    this.purchaseData();
    return this.findSelectedItemDetail()?.quantity ?? 0;
  });

  private lowestTotal = computed(() => {
    const list = this.comparisonList();
    return list.length > 1 ? Math.min(...list.map((c) => Number(c.totalCost) || 0)) : null;
  });

  stats = computed<DetailViewStat[]>(() => {
    const list = this.comparisonList();
    const selected = list.find((c) => c.selected);
    const fmt = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${this.currency()}`.trim();
    const lowest = this.lowestTotal();
    const over = selected && lowest !== null ? (Number(selected.totalCost) || 0) - lowest : 0;
    return [
      { label: 'Quotes', value: String(list.length) },
      { label: 'Selected supplier', value: selected?.supplierName || '—' },
      { label: 'Selected total', value: selected ? fmt(Number(selected.totalCost) || 0) : '—' },
      { label: 'Lowest quote', value: lowest !== null ? fmt(lowest) : '—' },
      { label: 'Above lowest', value: fmt(over), danger: over > 0 },
    ];
  });

  comparisonForm: FormGroup = this.fb.group({
    purchaseNo: ['', [Validators.required]],
    jobId: ['', [Validators.required]],
    product: [''],
    inventoryList: [[]],
    partNo: ['']
  })

  ngOnInit(): void {
    this.purchaseId = (this.drawer ? this.purchaseIdInput : this.route.snapshot.paramMap.get('purchaseId')) || '';

    if (!this.purchaseId) {
      this.toaster.error('Invalid purchase ID');
      if (this.drawer) {
        this.closed.emit();
      } else {
        this.router.navigate(['/purchase/pr']);
      }
      return;
    }

    // Get the selected item ID from the drawer input or the page's query params
    const selectedItemId = this.drawer ? this.selectedItemIdInput : this.route.snapshot.queryParamMap.get('selectedItem');
    if (selectedItemId) {
      this.selectedItemId.set(selectedItemId);
    }

    this.loadPurchaseData();
  }

  ngAfterViewInit(): void {
    // Mounted closed and opened on the next tick so the drawer slides in instead of appearing.
    if (this.drawer) setTimeout(() => (this.drawerShown = true));
  }

  // --- Drawer mode -------------------------------------------------------------------

  drawerShown = false;

  closeDrawer(): void {
    if (!this.drawerShown) return;
    this.drawerShown = false;
    setTimeout(() => this.closed.emit(), 250);
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
          this.router.navigate(['/purchase/pr']);
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
            if (this.drawer) {
              this.saved.emit();
              this.closeDrawer();
            } else {
              this.router.navigate(['/purchase/edit', this.purchaseId]);
            }
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
    if (this.drawer) {
      this.closeDrawer();
    } else {
      this.router.navigate(['/purchase/edit', this.purchaseId]);
    }
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
    const selectedComparison = comparisonEntries.find(entry => entry.selected);

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
              : item.partNo,
            unitCost: isTarget && selectedComparison ? selectedComparison.unitPrice : item.unitCost,
            supplierName: isTarget && selectedComparison ? selectedComparison.supplierName : item.supplierName,
            availability: isTarget && selectedComparison ? selectedComparison.etaTerms : item.availability
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

    const dialog = this.modal.open<any>(ComparisonFormComponent, {
      width: '600px',
      closeOnBackdrop: false,
      data: {
        itemDetail: selectedItemDetail,
        quantity: quantity,
        currency: this.currency()
      }
    })

    dialog.afterClosed().subscribe((res: any) => {
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

    const dialog = this.modal.open<any>(ComparisonFormComponent, {
      width: '600px',
      closeOnBackdrop: false,
      data: {
        itemDetail: selectedItemDetail,
        existingComparison: comparison,
        isEditMode: true,
        quantity: selectedItemDetail?.quantity || comparison.quantity || 0,
        currency: this.currency()
      }
    })

    dialog.afterClosed().subscribe((res: any) => {
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

  isLowest(comparison: any): boolean {
    const lowest = this.lowestTotal();
    return lowest !== null && (Number(comparison.totalCost) || 0) === lowest;
  }

  getSelectedComparison() {
    return this.comparisonList().find(item => item.selected) || null;
  }

  onAddSupplier() {
    // The suppliers module now creates via an in-page drawer rather than a routed create page.
    this.router.navigate(['/suppliers']);
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

  createProductOpen = false;
  createProductPrefill: { productSegment?: string; productCategoryName?: string; productDescription?: string } | null = null;

  onCreatePartNumber(): void {
    this.createProductPrefill = null;
    this.createProductOpen = true;
  }

  onProductCreated(result: any): void {
    if (!result?.partNo || !result?._id) return;
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
