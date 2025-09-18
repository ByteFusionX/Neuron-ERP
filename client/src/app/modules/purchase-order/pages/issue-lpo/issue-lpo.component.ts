import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { PurchaseService } from 'src/app/core/services/purchase/purchase.service';
import { PurchaseOrderService } from 'src/app/core/services/purchaseOrder/purchaseOrder.service';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { PurchaseData } from 'src/app/shared/interfaces/purchase.interface';
import { NumberFormatterPipe } from 'src/app/shared/pipes/numFormatter.pipe';

@Component({
  selector: 'app-issue-lpo',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SelectDropdownComponent,
    FormFieldComponent,
    NgSelectModule,
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
  purchase: PurchaseData | null = null;
  isLoading: boolean = true;
  suppliersList = signal<any[]>([]);
  isSubmitted = signal<boolean>(false);
  selectedSupplier = signal<any>(null);
  items = signal<any[]>([]);
  subscriptions = new Subscription();
  generatedPONumber = signal<string>('');
  isCreatingPO = signal<boolean>(false);
  
  currencyOptions = [
    { label: 'QAR', value: 'QAR' },
    { label: 'USD', value: 'USD' }
  ];

  poForm!: FormGroup;
  termsAndConditions: any[] = [];

  get f() {
    return this.poForm.controls;
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadTermsAndConditions();
    this.generatePONumber();
    this.purchaseId = <string>this.route.snapshot.paramMap.get('id');
    if (!this.purchaseId) {
      this.notificationService.error('Invalid Purchase ID');
      this.router.navigate(['/purchase/approves']);
      return;
    }

    this.subscriptions.add(
      this.purchaseService.getPurchaseById(this.purchaseId).subscribe({
        next: (response) => {
          this.purchase = response.data;
          this.isLoading = false;
          if (this.purchase) {
            const items = this.hasComparisons(this.purchase)
            items.forEach(item => {
              this.getSupplierData(item.comparisons.supplierId)
            })
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

  onSupplierSelected(supplierId: any) {
    if(!supplierId) {
      this.selectedSupplier.set(null);
      this.items.set([]);
      this.poForm.reset();
      this.poForm.get('poNo')?.setValue(this.generatedPONumber());
      this.requestedSupplierId.set('');
      return;
    };
    const suppliers = this.suppliersList()
    const items = this.hasComparisons(this.purchase)
    const hasSupplier = suppliers.find(supplier => supplier._id === supplierId)
    if (items) {
      const supplierDiscount = this.purchase?.supplierDiscounts?.suppliers.find(supplier => supplier.supplierId === supplierId)?.discount || 0
      const hasItem = items.filter(item => item.comparisons.supplierId === supplierId);
      if (hasSupplier && hasItem) {
        this.selectedSupplier.set(hasSupplier)
        this.items.set(hasItem)
            this.poForm.patchValue({
              discount: supplierDiscount
            })
      } else {
        this.notificationService.error('Selected supplier is not associated with this purchase order.');
        this.requestedSupplierId.set('');
      }
    }
  }

  getSupplierData(supplierId: string) {
    this.subscriptions.add(
      this.supplierService.getSupplierById(supplierId).subscribe({
        next: (res) => {
          this.suppliersList.set([res.data])
        }, error: (error) => {
          console.log(error);
        }
      })
    )
  }

  getSubTotal() {
    const subtotal = this.items().reduce((total, item) => {
      return total + (item.comparisons.quantity * item.comparisons.unitPrice);
    }, 0);
    return subtotal;
  }

  getDiscountedPrice() {
    const subtotal = this.getSubTotal();
    const discount = this.poForm.value.discount || 0;
    return subtotal - discount;
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
      poStatus: 'Issued',
      items: this.items().map(item => ({
        detail: item.detail,
        quantity: item.comparisons.quantity,
        unitCost: item.comparisons.unitPrice,
        totalCost: item.comparisons.quantity * item.comparisons.unitPrice
      })),
      supplierId: this.selectedSupplier()._id,
      purchaseId: this.purchaseId,
      jobId: this.purchase?.jobId._id,
      quoteId: this.purchase?.quoteId?._id,
      etaTerms: this.items()[0]?.comparisons?.etaTerms || '',
      paymentTerms: this.items()[0]?.comparisons?.paymentTerms || '',
      shippingTerms: formData.shippingTerms,
      deliveryTerms: this.items()[0]?.comparisons?.etaTerms || 'As per terms',
      placeOfDelivery: formData.placeOfDelivery,
      subject: formData.subject,
      poDate: new Date(formData.poDate),
      termsAndCondition: formData.termsAndCondition,
      discount: discount,
    };

    this.subscriptions.add(
      this.purchaseOrderService.createPurchaseOrder(purchaseOrderData).subscribe({
        next: (response) => {
          this.isCreatingPO.set(false);
          if (response.success) {
            this.notificationService.success('Purchase Order created successfully!');
            this.router.navigate(['/purchase/approves']);
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

  onSaveClicks() {

  }

  onDiscardClicks() {
    this.router.navigate(['/purchase/initiate-lpo', this.purchaseId]);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
