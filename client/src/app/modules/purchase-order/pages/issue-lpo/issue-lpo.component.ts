import { CommonModule, NgFor } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgSelectComponent, NgOptionComponent, NgFooterTemplateDirective } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-issue-lpo',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    NgSelectComponent,
    NgFor,
    NgOptionComponent,
    NgFooterTemplateDirective,
    NumberFormatterPipe
  ],
  templateUrl: './issue-lpo.component.html',
  styleUrl: './issue-lpo.component.css'
})
export class IssueLpoComponent implements OnInit, OnDestroy {

  private purchaseService = inject(PurchaseService);
  private supplierService = inject(SupplierService);
  private notificationService = inject(ToastrService);
  private employeeService = inject(EmployeeService);
  private purchaseOrderService = inject(PurchaseOrderService);
  private profileService = inject(ProfileService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  requestedSupplierId = signal<string>('');
  purchaseId!: string;
  lpoId: string | null = null;
  isEditMode = false;
  isReissueMode = false;
  originalLpoItems = signal<Map<string, number>>(new Map());
  purchase: PurchaseData | null = null;
  isLoading: boolean = true;
  suppliersList = signal<any[]>([]);
  isSubmitted = signal<boolean>(false);
  selectedSupplier = signal<any>(null);
  items = signal<any[]>([]);
  selectedItems = signal<Set<string>>(new Set());
  itemQuantities = signal<Map<string, number>>(new Map());
  subscriptions = new Subscription();
  generatedPONumber = signal<string>('');
  isCreatingPO = signal<boolean>(false);
  isSavingDraft = signal<boolean>(false);
  currency = signal<string>('QAR');
  canInitiateLPO = signal<boolean>(false);
  canReissueAndRevoke = signal<boolean>(false);

  currencyOptions = [
    { label: 'QAR', value: 'QAR' },
    { label: 'USD', value: 'USD' }
  ];

  poForm!: FormGroup;
  termsAndConditions: any[] = [];
  placesOfDelivery: any[] = [];
  shippingTermsList: any[] = [];

  get f() {
    return this.poForm.controls;
  }

  ngOnInit(): void {
    this.checkPrivileges();
    this.initializeForm();
    this.loadTermsAndConditions();
    this.loadPlacesOfDelivery();
    this.loadShippingTerms();
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    this.lpoId = this.route.snapshot.paramMap.get('lpoId');
    
    // Detect mode from URL
    const url = this.router.url;
    this.isReissueMode = url.includes('/reissue/');
    this.isEditMode = url.includes('/edit/') || this.isReissueMode;
    
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
      this.router.navigate(['/purchase/approves']);
      return;
    }

    if (this.isEditMode && this.lpoId) {
      if (this.isReissueMode) {
        this.loadReissueLpo(this.lpoId);
      } else {
        this.loadDraftLpo(this.lpoId);
      }
    } else {
      this.generatePONumber();
    }

    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (response) => {
          this.purchase = response.data;
          const currency = this.purchase?.jobId?.quoteId?.currency || 
                         this.purchase?.jobId?.quoteId?.dealData?.currency ||
                         'QAR';
          this.currency.set(currency);
          this.isLoading = false;
          if (this.purchase && !this.isEditMode) {
            this.loadSuppliers();
          }
        },
        error: (error) => {
          this.notificationService.error('Failed to load purchase details');
          console.error('Error loading purchase:', error);
          this.isLoading = false;
          this.router.navigate(['/purchase/approves']);
        }
      })
    )
  }

  initializeForm(): void {
    this.poForm = this.fb.group({
      supplierId: ['', [Validators.required]],
      poNo: ['', [Validators.required]],
      subject: ['', [Validators.required]],
      shippingTerms: ['', [Validators.required]],
      placeOfDelivery: ['', [Validators.required]],
      poDate: [new Date().toISOString().split('T')[0], [Validators.required]],
      termsAndCondition: ['', [Validators.required]],
      discount: [0, [Validators.min(0)]]
    });
  }

  loadTermsAndConditions(): void {
    this.subscriptions.add(
      this.profileService.getNotes().subscribe({
        next: (response: any) => {
          this.termsAndConditions = response?.termsAndConditions || [];
        },
        error: (error: any) => {
          console.error('Error loading terms and conditions:', error);
        }
      })
    );
  }

  loadPlacesOfDelivery(): void {
    this.subscriptions.add(
      this.profileService.getNotes().subscribe({
        next: (response: any) => {
          this.placesOfDelivery = response?.placeOfDelivery || [];
        },
        error: (error: any) => {
          console.error('Error loading places of delivery:', error);
        }
      })
    );
  }

  loadShippingTerms(): void {
    this.subscriptions.add(
      this.profileService.getNotes().subscribe({
        next: (response: any) => {
          this.shippingTermsList = response?.shippingTerms || [];
        },
        error: (error: any) => {
          console.error('Error loading shipping terms:', error);
        }
      })
    );
  }

  isPlaceSaved(placeNote: string): boolean {
    return this.placesOfDelivery.some(place => place.note === placeNote);
  }

  createPlaceOfDelivery(): void {
    const currentValue = this.poForm.get('placeOfDelivery')?.value;
    if (!currentValue || currentValue.trim() === '') {
      this.notificationService.warning('Please enter a place of delivery before creating');
      return;
    }
    
    // Check if it already exists
    const exists = this.placesOfDelivery.some(place => place.note.toLowerCase() === currentValue.trim().toLowerCase());
    if (exists) {
      this.notificationService.info('This place of delivery already exists');
      return;
    }
    
    this.subscriptions.add(
      this.profileService.createPlaceOfDelivery({ note: currentValue.trim() }).subscribe({
        next: (response: any) => {
          this.notificationService.success('Place of delivery created successfully');
          this.placesOfDelivery = response?.placeOfDelivery || [];
        },
        error: (error: any) => {
          console.error('Error creating place of delivery:', error);
          this.notificationService.error('Failed to create place of delivery');
        }
      })
    );
  }

  isShippingTermSaved(termNote: string): boolean {
    return this.shippingTermsList.some(term => term.note === termNote);
  }

  createShippingTerm(): void {
    const currentValue = this.poForm.get('shippingTerms')?.value;
    if (!currentValue || currentValue.trim() === '') {
      this.notificationService.warning('Please enter shipping terms before creating');
      return;
    }
    
    const exists = this.shippingTermsList.some(term => term.note.toLowerCase() === currentValue.trim().toLowerCase());
    if (exists) {
      this.notificationService.info('These shipping terms already exist');
      return;
    }
    
    this.subscriptions.add(
      this.profileService.createShippingTerms({ note: currentValue.trim() }).subscribe({
        next: (response: any) => {
          this.notificationService.success('Shipping terms created successfully');
          this.shippingTermsList = response?.shippingTerms || [];
        },
        error: (error: any) => {
          console.error('Error creating shipping terms:', error);
          this.notificationService.error('Failed to create shipping terms');
        }
      })
    );
  }

  onTermsAndConditionSelect(event: any): void {
    if (event?.note) {
      this.poForm.patchValue({
        termsAndCondition: event.note
      });
    }
  }

  hasComparisons(purchase: any): any[] {
    if (!purchase?.items?.length) return [];

    return purchase.items.flatMap((item: any) =>
      (item.itemDetails || []).flatMap((details: any) => {
        const selected = (details.comparisons || []).find((c: any) => c.selected === true);
        if (!selected) return [];
        return [{
          ...details,
          itemName: item.itemName,
          comparisons: selected
        }];
      })
    );
  }

  formatPartNumber(partNo: any): string {
    if (!partNo) return '-';
    if (typeof partNo === 'string') return partNo;
    if (partNo.partNo) {
      return partNo.productDescription 
        ? `${partNo.partNo}`
        : partNo.partNo;
    }
    return '-';
  }

  getPartNumberForItem(item: any): string {
    const partNo = item.partNo;
    return this.formatPartNumber(partNo);
  }

  onSupplierSelected(supplierId: any) {
    if(!supplierId) {
      this.selectedSupplier.set(null);
      this.items.set([]);
      this.selectedItems.set(new Set());
      this.poForm.patchValue({
        supplierId: '',
        discount: 0
      });
      this.poForm.get('poNo')?.setValue(this.generatedPONumber());
      this.requestedSupplierId.set('');
      return;
    };
    const suppliers = this.suppliersList()
    const items = this.hasComparisons(this.purchase)
    const hasSupplier = suppliers.find(supplier => supplier._id === supplierId)
    
    if (hasSupplier && !hasSupplier.canSelect) {
      this.notificationService.warning('All quantities for this supplier have already been issued.');
      this.poForm.patchValue({ supplierId: '' });
      this.requestedSupplierId.set('');
      return;
    }
    
    if (hasSupplier) {
      const supplierDiscount = this.purchase?.supplierDiscounts?.suppliers.find(supplier => supplier.supplierId === supplierId)?.discount || 0
      this.selectedSupplier.set(hasSupplier)
      this.requestedSupplierId.set(supplierId);
      this.poForm.patchValue({
        supplierId: supplierId,
        discount: supplierDiscount
      });
      
      this.loadItemsForSupplier(supplierId);
    } else {
      this.notificationService.error('Selected supplier is not associated with this purchase order.');
      this.poForm.patchValue({ supplierId: '' });
      this.requestedSupplierId.set('');
    }
  }

  loadItemsForSupplier(supplierId: string) {
    this.subscriptions.add(
      this.purchaseOrderService.getItemsForPurchaseRequest(this.purchaseId, supplierId).subscribe({
        next: (response) => {
          if (response.success) {
            const items = response.data;
            this.items.set(items);
            const selectableItems = items.filter((item: any) => !item.isIssued);
            const selectableItemIds = new Set<string>(selectableItems.map((item: any) => item._id as string));
            this.selectedItems.set(selectableItemIds);
            
            const quantitiesMap = new Map<string, number>();
            items.forEach((item: any) => {
              if (!item.isIssued && item.remainingQuantity > 0) {
                quantitiesMap.set(item._id, item.remainingQuantity);
              }
            });
            this.itemQuantities.set(quantitiesMap);
          }
        },
        error: (error) => {
          console.error('Error loading items:', error);
          this.notificationService.error('Failed to load items');
        }
      })
    );
  }

  loadSuppliers() {
    this.subscriptions.add(
      this.purchaseOrderService.getSuppliersForPurchaseRequest(this.purchaseId).subscribe({
        next: (response) => {
          if (response.success) {
            this.suppliersList.set(response.data);
          }
        },
        error: (error) => {
          console.error('Error loading suppliers:', error);
          this.notificationService.error('Failed to load suppliers');
        }
      })
    );
  }

  toggleItemSelection(itemId: string, isIssued: boolean = false) {
    // In reissue mode, allow selecting even if marked as issued
    if (isIssued && !this.isReissueMode) {
      return;
    }
    const selected = new Set(this.selectedItems());
    if (selected.has(itemId)) {
      selected.delete(itemId);
    } else {
      selected.add(itemId);
    }
    this.selectedItems.set(selected);
  }

  toggleSelectAll() {
    const currentSelected = this.selectedItems();
    const allItems = this.items();
    const selectableItems = allItems.filter((item: any) => !item.isIssued);
    const allSelected = selectableItems.every(item => {
      const itemId = item._id || `${item.detail}-${item.comparisons.quantity}`;
      return currentSelected.has(itemId);
    });

    if (allSelected) {
      this.selectedItems.set(new Set());
    } else {
      const allItemIds = new Set(selectableItems.map((item: any) => item._id || `${item.detail}-${item.comparisons.quantity}`));
      this.selectedItems.set(allItemIds);
    }
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedItems().has(itemId);
  }

  isAllSelected(): boolean {
    const allItems = this.items();
    const selectableItems = allItems.filter((item: any) => !item.isIssued);
    if (selectableItems.length === 0) return false;
    return selectableItems.every(item => {
      const itemId = item._id || `${item.detail}-${item.comparisons.quantity}`;
      return this.selectedItems().has(itemId);
    });
  }

  getSelectedItems(): any[] {
    const selectedIds = this.selectedItems();
    return this.items().filter(item => {
      const quantity = item.comparisons?.quantity || item.quantity || 0;
      const itemId = item._id || `${item.detail}-${quantity}`;
      return selectedIds.has(itemId);
    });
  }

  updateItemQuantity(itemId: string, value: string) {
    const quantities = new Map(this.itemQuantities());
    const numValue = value === '' ? 0 : parseFloat(value);
    if (isNaN(numValue)) {
      quantities.set(itemId, 0);
    } else {
      quantities.set(itemId, numValue);
    }
    this.itemQuantities.set(quantities);
  }

  validateItemQuantity(itemId: string): string | null {
    const quantities = this.itemQuantities();
    const item = this.items().find(i => i._id === itemId);
    if (!item) return null;
    
    const quantity = quantities.get(itemId) || 0;
    
    // In reissue mode, validate against remainingQuantity which already accounts for:
    // - This LPO being excluded from calculations
    // - Other LPOs being issued/reduced
    // remainingQuantity = totalQuantity - (other LPOs issued)
    // So when reissuing, we can issue up to remainingQuantity (which includes the original LPO capacity + any freed capacity)
    let maxQuantity: number;
    if (this.isReissueMode) {
      // Get the original LPO quantity for this item (keyed by item.detail)
      const originalLpoQty = this.originalLpoItems().get(item.detail) || 0;
      const remainingQuantity = item.remainingQuantity || 0;
      
      // remainingQuantity already represents available capacity when this LPO is excluded
      // This means it includes the original LPO's capacity plus any capacity freed from other LPOs
      // For example: if LPO 1 had 8, LPO 2 was reduced from 4 to 2, then remainingQuantity = 10 (8 + 2 freed)
      maxQuantity = remainingQuantity > 0 ? remainingQuantity : originalLpoQty;
    } else {
      maxQuantity = item.remainingQuantity || item.originalQuantity || 0;
    }
    
    if (quantity <= 0) {
      return 'Quantity must be greater than 0';
    }
    if (quantity > maxQuantity) {
      const errorMsg = this.isReissueMode 
        ? `Quantity cannot exceed ${maxQuantity} (original LPO quantity plus available capacity)`
        : `Quantity cannot exceed ${maxQuantity}`;
      return errorMsg;
    }
    return null;
  }

  getItemQuantityError(itemId: string): string | null {
    const item = this.items().find(i => i._id === itemId);
    if (!item || !this.isItemSelected(itemId)) return null;
    return this.validateItemQuantity(itemId);
  }

  getItemQuantity(itemId: string): number {
    const quantities = this.itemQuantities();
    return quantities.get(itemId) ?? 0;
  }

  getSubTotal() {
    const selectedItems = this.getSelectedItems();
    const quantities = this.itemQuantities();
    const subtotal = selectedItems.reduce((total, item) => {
      const quantity = quantities.get(item._id) || item.remainingQuantity || item.quantity || 0;
      const unitPrice = item.comparisons?.unitPrice || item.unitPrice || 0;
      return total + (quantity * unitPrice);
    }, 0);
    return subtotal;
  }

  getDiscountedPrice() {
    const subtotal = this.getSubTotal();
    const discount = this.poForm.value.discount || 0;
    return subtotal - discount;
  }

  formatCurrency(value: number): string {
    const currency = this.currency();
    const formattedValue = (value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    if (currency) {
      return `${formattedValue} ${currency}`;
    }
    return formattedValue;
  }

  generatePONumber(): void {
    this.subscriptions.add(
      this.purchaseOrderService.generatePONumber().subscribe({
        next: (response) => {
          if (response.success) {
            this.generatedPONumber.set(response.data);
            this.poForm.patchValue({
              poNo: response.data
            });
          }
        },
        error: (error) => {
          console.error('Error generating PO number:', error);
          this.notificationService.error('Failed to generate PO number');
        }
      })
    );
  }

  onIssueClicks() {
    this.isSubmitted.set(true);
    
    if (this.poForm.invalid) {
      this.notificationService.error('Please fill in all required fields');
      return;
    }

    if (!this.selectedSupplier()) {
      this.notificationService.error('Please select a supplier');
      return;
    }

    const selectedItems = this.getSelectedItems();
    if (selectedItems.length === 0) {
      this.notificationService.error('Please select at least one item to issue LPO');
      return;
    }

    const quantities = this.itemQuantities();
    const invalidItems: string[] = [];
    
    selectedItems.forEach(item => {
      const qty = quantities.get(item._id) || 0;
      
      // In reissue mode, validate against remainingQuantity which already accounts for:
      // - This LPO being excluded from calculations
      // - Other LPOs being issued/reduced
      let maxQty: number;
      if (this.isReissueMode) {
        // Get the original LPO quantity for this item (keyed by item.detail)
        const originalLpoQty = this.originalLpoItems().get(item.detail) || 0;
        const remainingQuantity = item.remainingQuantity || 0;
        
        // remainingQuantity already represents available capacity when this LPO is excluded
        // This means it includes the original LPO's capacity plus any capacity freed from other LPOs
        // For example: if LPO 1 had 8, LPO 2 was reduced from 4 to 2, then remainingQuantity = 10 (8 + 2 freed)
        maxQty = remainingQuantity > 0 ? remainingQuantity : originalLpoQty;
      } else {
        maxQty = item.remainingQuantity || item.originalQuantity || 0;
      }
      
      if (qty <= 0) {
        invalidItems.push(`${item.detail} (quantity must be greater than 0)`);
      } else if (qty > maxQty) {
        const errorMsg = this.isReissueMode 
          ? `${item.detail} (quantity cannot exceed ${maxQty} - original LPO quantity plus available capacity)`
          : `${item.detail} (quantity cannot exceed ${maxQty})`;
        invalidItems.push(errorMsg);
      }
    });

    if (invalidItems.length > 0) {
      this.notificationService.error(`Please fix quantity errors: ${invalidItems.join(', ')}`);
      return;
    }

    if (!this.generatedPONumber()) {
      this.notificationService.error('PO number not generated. Please try again.');
      return;
    }

    this.isCreatingPO.set(true);

    const formData = this.poForm.value;
    const subtotal = this.getSubTotal();
    const discount = formData.discount || 0;
    const totalLpoValue = subtotal - discount;

    const purchaseOrderData = {
      poNo: this.generatedPONumber(),
      poStatus: 'Pending for Approval',
      items: selectedItems.map(item => {
        const partNo = item.partNo || null;
        const quantities = this.itemQuantities();
        const quantity = quantities.get(item._id) || 0;
        const unitPrice = item.comparisons?.unitPrice || item.unitPrice || 0;
        console.log(`[Frontend] Sending item: ${item.detail}, Quantity: ${quantity}, Original: ${item.originalQuantity}, Remaining: ${item.remainingQuantity}`);
        return {
          detail: item.detail,
          partNo: partNo,
          quantity: quantity,
          unitCost: unitPrice,
          totalCost: quantity * unitPrice
        };
      }),
      supplierId: this.selectedSupplier()._id,
      purchaseId: this.purchaseId,
      jobId: this.purchase?.jobId._id,
      quoteId: this.purchase?.quoteId?._id,
      etaTerms: selectedItems[0]?.comparisons?.etaTerms || '',
      paymentTerms: selectedItems[0]?.comparisons?.paymentTerms || '',
      shippingTerms: formData.shippingTerms,
      deliveryTerms: selectedItems[0]?.comparisons?.etaTerms || selectedItems[0]?.comparisons?.paymentTerms || 'As per terms',
      placeOfDelivery: formData.placeOfDelivery,
      subject: formData.subject,
      poDate: new Date(formData.poDate),
      termsAndCondition: formData.termsAndCondition,
      discount: discount,
    };

    if (this.isReissueMode && this.lpoId) {
      // Use reissue API endpoint
      this.reissuePurchaseOrder(purchaseOrderData);
    } else if (this.isEditMode && this.lpoId) {
      this.subscriptions.add(
        this.purchaseOrderService.updatePurchaseOrder(this.lpoId, purchaseOrderData).subscribe({
          next: (response) => {
            this.isCreatingPO.set(false);
            if (response) {
              this.notificationService.success('Purchase Order updated and issued successfully!');
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
            } else {
              this.notificationService.error('Failed to update Purchase Order');
            }
          },
          error: (error) => {
            this.isCreatingPO.set(false);
            console.error('Error updating purchase order:', error);
            this.notificationService.error('Failed to update Purchase Order. Please try again.');
          }
        })
      );
    } else {
      this.subscriptions.add(
        this.purchaseOrderService.createPurchaseOrder(purchaseOrderData).subscribe({
          next: (response) => {
            this.isCreatingPO.set(false);
            if (response.success) {
              this.notificationService.success('Purchase Order created successfully!');
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
            } else {
              this.notificationService.error('Failed to create Purchase Order');
            }
          },
          error: (error) => {
            this.isCreatingPO.set(false);
            console.error('Error creating purchase order:', error);
            this.notificationService.error('Failed to create Purchase Order. Please try again.');
          }
        })
      );
    }
  }

  loadDraftLpo(lpoId: string) {
    this.isLoading = true;
    this.subscriptions.add(
      this.purchaseOrderService.getPurchaseOrderById(lpoId).subscribe({
        next: (response: any) => {
          if (response.success || response._id) {
            const lpo = response.success ? response.data : response;
            this.lpoId = lpo._id;
            this.generatedPONumber.set(lpo.poNo);
            
            this.poForm.patchValue({
              supplierId: lpo.supplierId?._id || lpo.supplierId,
              poNo: lpo.poNo,
              subject: lpo.subject,
              shippingTerms: lpo.shippingTerms,
              placeOfDelivery: lpo.placeOfDelivery,
              poDate: lpo.poDate ? new Date(lpo.poDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              termsAndCondition: lpo.termsAndCondition,
              discount: lpo.discount || 0
            });

            if (lpo.supplierId) {
              const supplierId = lpo.supplierId._id || lpo.supplierId;
              this.requestedSupplierId.set(supplierId);
              
              // Load suppliers first, then load items
              this.subscriptions.add(
                this.purchaseOrderService.getSuppliersForPurchaseRequest(this.purchaseId).subscribe({
                  next: (suppliersResponse) => {
                    if (suppliersResponse.success) {
                      this.suppliersList.set(suppliersResponse.data);
                      const supplier = this.suppliersList().find(s => s._id === supplierId);
                      if (supplier) {
                        this.selectedSupplier.set(supplier);
                        const supplierDiscount = this.purchase?.supplierDiscounts?.suppliers.find(s => s.supplierId === supplierId)?.discount || 0;
                        this.poForm.patchValue({
                          discount: supplierDiscount
                        });
                      }
                      
                      // Now load items for the supplier
                      this.subscriptions.add(
                        this.purchaseOrderService.getItemsForPurchaseRequest(this.purchaseId, supplierId).subscribe({
                          next: (itemsResponse) => {
                            if (itemsResponse.success) {
                              const items = itemsResponse.data;
                              this.items.set(items);
                              
                              const quantitiesMap = new Map<string, number>();
                              const selectedIds = new Set<string>();
                              
                              if (lpo.items && Array.isArray(lpo.items)) {
                                lpo.items.forEach((lpoItem: any) => {
                                  const matchingItem = items.find((i: any) => i.detail === lpoItem.detail);
                                  if (matchingItem) {
                                    quantitiesMap.set(matchingItem._id, lpoItem.quantity || 0);
                                    selectedIds.add(matchingItem._id);
                                  }
                                });
                              }
                              
                              this.itemQuantities.set(quantitiesMap);
                              this.selectedItems.set(selectedIds);
                              
                              this.isLoading = false;
                            }
                          },
                          error: (error) => {
                            console.error('Error loading items for draft:', error);
                            this.notificationService.error('Failed to load items for draft');
                            this.isLoading = false;
                          }
                        })
                      );
                    }
                  },
                  error: (error) => {
                    console.error('Error loading suppliers for draft:', error);
                    this.notificationService.error('Failed to load suppliers for draft');
                    this.isLoading = false;
                  }
                })
              );
            } else {
              this.isLoading = false;
            }
          }
        },
        error: (error) => {
          console.error('Error loading draft LPO:', error);
          this.notificationService.error('Failed to load draft LPO');
          this.isLoading = false;
          this.generatePONumber();
        }
      })
    );
  }

  loadReissueLpo(lpoId: string) {
    this.isLoading = true;
    this.subscriptions.add(
      this.purchaseOrderService.getPurchaseOrderById(lpoId).subscribe({
        next: (response: any) => {
          if (response.success || response._id) {
            const lpo = response.success ? response.data : response;
            
            // Check if LPO is approved - prevent re-issue
            if (lpo.poStatus === 'Approved') {
              this.notificationService.error('Cannot re-issue an approved LPO');
              this.isLoading = false;
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
              return;
            }
            
            this.lpoId = lpo._id;
            this.generatedPONumber.set(lpo.poNo);
            
            // Store original items for reissue calculation
            this.storeOriginalLpoItems(lpo.items);
            
            // Populate form with LPO data
            this.populateFormFromLpo(lpo);
            
            if (lpo.supplierId) {
              const supplierId = lpo.supplierId._id || lpo.supplierId;
              this.loadSupplierAndItemsForReissue(supplierId, lpo.items);
            } else {
              this.isLoading = false;
            }
          }
        },
        error: (error) => {
          console.error('Error loading LPO for reissue:', error);
          this.notificationService.error('Failed to load LPO for reissue');
          this.isLoading = false;
          this.generatePONumber();
        }
      })
    );
  }

  private storeOriginalLpoItems(items: any[]): void {
    const originalItemsMap = new Map<string, number>();
    if (items && Array.isArray(items)) {
      items.forEach((item: any) => {
        originalItemsMap.set(item.detail, item.quantity || 0);
      });
    }
    this.originalLpoItems.set(originalItemsMap);
  }

  private populateFormFromLpo(lpo: any): void {
    this.poForm.patchValue({
      supplierId: lpo.supplierId?._id || lpo.supplierId,
      poNo: lpo.poNo,
      subject: lpo.subject,
      shippingTerms: lpo.shippingTerms,
      placeOfDelivery: lpo.placeOfDelivery,
      poDate: lpo.poDate ? new Date(lpo.poDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      termsAndCondition: lpo.termsAndCondition,
      discount: lpo.discount || 0
    });
  }

  private loadSupplierAndItemsForReissue(supplierId: string, lpoItems: any[]): void {
    this.requestedSupplierId.set(supplierId);
    
    // Load suppliers first
    this.subscriptions.add(
      this.purchaseOrderService.getSuppliersForPurchaseRequest(this.purchaseId, this.lpoId || undefined).subscribe({
        next: (suppliersResponse) => {
          if (suppliersResponse.success) {
            this.suppliersList.set(suppliersResponse.data);
            this.setSelectedSupplier(supplierId);
            this.loadItemsForReissue(supplierId, lpoItems);
          }
        },
        error: (error) => {
          console.error('Error loading suppliers for reissue:', error);
          this.notificationService.error('Failed to load suppliers for reissue');
          this.isLoading = false;
        }
      })
    );
  }

  private setSelectedSupplier(supplierId: string): void {
    const supplier = this.suppliersList().find(s => s._id === supplierId);
    if (supplier) {
      this.selectedSupplier.set(supplier);
      const supplierDiscount = this.purchase?.supplierDiscounts?.suppliers.find(s => s.supplierId === supplierId)?.discount || 0;
      this.poForm.patchValue({
        discount: supplierDiscount
      });
    }
  }

  private loadItemsForReissue(supplierId: string, lpoItems: any[]): void {
    // When reissuing, exclude the current LPO from issued quantity calculations
    // This way, remaining quantities will be calculated as if the original LPO was never issued
    this.subscriptions.add(
      this.purchaseOrderService.getItemsForPurchaseRequest(this.purchaseId, supplierId, this.lpoId || undefined).subscribe({
        next: (itemsResponse) => {
          if (itemsResponse.success) {
            const items = itemsResponse.data;
            this.items.set(items);
            this.mapLpoItemsToCurrentItems(lpoItems, items);
            this.isLoading = false;
          }
        },
        error: (error) => {
          console.error('Error loading items for reissue:', error);
          this.notificationService.error('Failed to load items for reissue');
          this.isLoading = false;
        }
      })
    );
  }

  private mapLpoItemsToCurrentItems(lpoItems: any[], currentItems: any[]): void {
    const quantitiesMap = new Map<string, number>();
    const selectedIds = new Set<string>();
    
    if (lpoItems && Array.isArray(lpoItems)) {
      lpoItems.forEach((lpoItem: any) => {
        const matchingItem = currentItems.find((i: any) => i.detail === lpoItem.detail);
        if (matchingItem) {
          quantitiesMap.set(matchingItem._id, lpoItem.quantity || 0);
          selectedIds.add(matchingItem._id);
        }
      });
    }
    
    this.itemQuantities.set(quantitiesMap);
    this.selectedItems.set(selectedIds);
  }

  private reissuePurchaseOrder(purchaseOrderData: any): void {
    const originalItems = this.originalLpoItems();
    const originalItemsArray = Array.from(originalItems.entries()).map(([detail, qty]) => ({
      detail,
      quantity: qty
    }));

    const reissueData = {
      ...purchaseOrderData,
      originalItems: originalItemsArray
    };

    this.subscriptions.add(
      this.purchaseOrderService.reissuePurchaseOrder(this.lpoId!, reissueData).subscribe({
        next: (response) => {
          this.isCreatingPO.set(false);
          if (response) {
            this.notificationService.success('Purchase Order re-issued successfully!');
            this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
          } else {
            this.notificationService.error('Failed to re-issue Purchase Order');
          }
        },
        error: (error) => {
          this.isCreatingPO.set(false);
          console.error('Error re-issuing purchase order:', error);
          this.notificationService.error('Failed to re-issue Purchase Order. Please try again.');
        }
      })
    );
  }

  onSaveClicks() {
    this.isSubmitted.set(true);
    
    if (this.poForm.invalid) {
      this.notificationService.error('Please fill in all required fields');
      return;
    }

    if (!this.selectedSupplier()) {
      this.notificationService.error('Please select a supplier');
      return;
    }

    const selectedItems = this.getSelectedItems();
    if (selectedItems.length === 0) {
      this.notificationService.error('Please select at least one item to save');
      return;
    }

    const quantities = this.itemQuantities();
    const invalidItems: string[] = [];
    
    selectedItems.forEach(item => {
      const qty = quantities.get(item._id) || 0;
      const maxQty = item.remainingQuantity || item.originalQuantity || 0;
      
      if (qty <= 0) {
        invalidItems.push(`${item.detail} (quantity must be greater than 0)`);
      } else if (qty > maxQty) {
        invalidItems.push(`${item.detail} (quantity cannot exceed ${maxQty})`);
      }
    });

    if (invalidItems.length > 0) {
      this.notificationService.error(`Please fix quantity errors: ${invalidItems.join(', ')}`);
      return;
    }

    this.isSavingDraft.set(true);
    
    const formData = this.poForm.value;
    const subtotal = this.getSubTotal();
    const discount = formData.discount || 0;
    
    const purchaseOrderData = {
      poNo: this.generatedPONumber(),
      poStatus: 'Draft',
      items: selectedItems.map(item => {
        const partNo = item.partNo || null;
        const quantity = quantities.get(item._id) || 0;
        const unitPrice = item.comparisons?.unitPrice || item.unitPrice || 0;
        
        return {
          detail: item.detail,
          partNo: partNo,
          quantity: quantity,
          unitCost: unitPrice,
          totalCost: quantity * unitPrice
        };
      }),
      supplierId: this.selectedSupplier()._id,
      purchaseId: this.purchaseId,
      jobId: this.purchase?.jobId._id,
      quoteId: this.purchase?.quoteId?._id,
      etaTerms: selectedItems[0]?.comparisons?.etaTerms || '',
      paymentTerms: selectedItems[0]?.comparisons?.paymentTerms || '',
      shippingTerms: formData.shippingTerms,
      deliveryTerms: selectedItems[0]?.comparisons?.etaTerms || selectedItems[0]?.comparisons?.paymentTerms || 'As per terms',
      placeOfDelivery: formData.placeOfDelivery,
      subject: formData.subject,
      poDate: new Date(formData.poDate),
      termsAndCondition: formData.termsAndCondition,
      discount: discount,
    };

    if (this.isEditMode && this.lpoId) {
      this.subscriptions.add(
        this.purchaseOrderService.updatePurchaseOrder(this.lpoId, purchaseOrderData).subscribe({
          next: (response) => {
            this.isSavingDraft.set(false);
            if (response) {
              this.notificationService.success('Draft saved successfully!');
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
            } else {
              this.notificationService.error('Failed to save draft');
            }
          },
          error: (error) => {
            this.isSavingDraft.set(false);
            console.error('Error saving draft:', error);
            this.notificationService.error('Failed to save draft. Please try again.');
          }
        })
      );
    } else {
      this.subscriptions.add(
        this.purchaseOrderService.createPurchaseOrder(purchaseOrderData).subscribe({
          next: (response) => {
            this.isSavingDraft.set(false);
            if (response.success) {
              this.notificationService.success('Draft saved successfully!');
              this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
            } else {
              this.notificationService.error('Failed to save draft');
            }
          },
          error: (error) => {
            this.isSavingDraft.set(false);
            console.error('Error saving draft:', error);
            this.notificationService.error('Failed to save draft. Please try again.');
          }
        })
      );
    }
  }

  checkPrivileges(): void {
    this.employeeService.employeeData$.subscribe((data) => {
      if (data?.category?.privileges) {
        this.canInitiateLPO.set(data.category.privileges.purchaseOrder?.canInitiateLPO || false);
        this.canReissueAndRevoke.set(data.category.privileges.purchaseOrder?.canReissueAndRevoke || false);
      }
    });
  }

  onDiscardClicks() {
    this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
