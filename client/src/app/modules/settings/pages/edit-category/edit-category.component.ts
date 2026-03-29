import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { NgIf } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { PageLayoutComponent } from 'src/app/shared/components/page-layout/page-layout.component';

@Component({
    selector: 'app-edit-category',
    templateUrl: './edit-category.component.html',
    styleUrls: ['./edit-category.component.css'],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, appNoLeadingSpace, NgIf, PageLayoutComponent]
})
export class EditCategoryComponent implements OnInit {

  isSaving: boolean = false;
  error!: string;
  categoryId!: string;
  data!: GetCategory;

  dashboardChecked: boolean = false;
  employeeChecked: boolean = false;
  announcementChecked: boolean = false;
  customerChecked: boolean = false;
  enquiryChecked: boolean = false;
  assignedJobsChecked: boolean = false;
  quotationChecked: boolean = false;
  jobSheetChecked: boolean = false;
  purchaseChecked: boolean = false;
  purchaseOrderChecked: boolean = false;
  technicalChecked: boolean = false;
  supplierChecked: boolean = false;
  inventoryChecked: boolean = false;
  dispatchChecked: boolean = false;
  invoiceChecked: boolean = false;
  claimsChecked: boolean = false;
  portalChecked: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private _fb: FormBuilder,
    private _employeeService: EmployeeService,
    private _toast: ToastrService
  ) { }

  categoryForm = this._fb.group({
    categoryName: ['', Validators.required],
    role: ['', Validators.required],
    isSalespersonWithTarget: [false],
    privileges: this._fb.group({
      dashboard: this._fb.group({
        viewReport: 'all',
        compareAgainst: 'company',
      }),
      employee: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      announcement: this._fb.group({
        viewReport: 'none',
        create: [false],
        deleteOrEdit: [false]
      }),
      customer: this._fb.group({
        viewReport: 'none',
        create: [false],
        share: [false],
        transfer: [false],
      }),
      enquiry: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      assignedJob: this._fb.group({
        viewReport: 'none'
      }),
      quotation: this._fb.group({
        viewReport: 'none',
        create: [false]
      }),
      dealSheet: [false],
      jobSheet: this._fb.group({
        viewReport: 'none',
        allocateJobs: [false],
        transferProcurementPerson: [false],
      }),
      purchase: this._fb.group({
        viewReport: 'none',
        create: [false],
        canApprovePR: [false],
      }),
      purchaseOrder: this._fb.group({
        viewReport: 'none',
        canInitiateLPO: [false],
        canApprovePOs: [false],
        canReissueAndRevoke: [false],
      }),
      technical: this._fb.group({
        canViewOpenToWorkAndAssign: [false],
        canTransferToEngineer: [false],
        viewReport: 'none',
        canApproveMRRequests: [false],
      }),
      supplier: this._fb.group({
        viewReport: 'none',
        canApproveSupplier: [false],
      }),
      inventory: this._fb.group({
        products: this._fb.group({
          viewReport: 'none',
        }),
        stockEntries: this._fb.group({
          viewReport: 'none',
        }),
      }),
      dispatch: this._fb.group({
        viewReport: 'none',
        createDeliveryNote: [false],
        viewPendingDelivery: [false],
        viewInvoiceLinking: [false],
        viewInventoryDeduction: [false],
      }),
      invoice: this._fb.group({
        viewReport: 'none',
        createInvoice: [false],
        viewInvoicesVsDn: [false],
        viewCancelledAdjusted: [false],
        viewReissued: [false],
      }),
      claims: this._fb.group({
        viewReport: 'none',
        canApprove: [false],
      }),
      portalManagement: this._fb.group({
        department: [false],
        notesAndTerms: [false],
        companyTarget: [false],
        customerType: [false]
      })
    })
  })

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.categoryId = params['id'];
      if (this.categoryId) {
        this._employeeService.getCategory().subscribe({
          next: (categories) => {
            const category = categories.find(cat => cat._id === this.categoryId);
            if (category) {
              this.data = category;
              this.updateChecks(this.data.privileges);
              const dashboardGroup = this.categoryForm.get('privileges.dashboard') as FormGroup;

              if (!this.data.isSalespersonWithTarget) {
                dashboardGroup.get('compareAgainst')?.disable();
              }
              this.categoryForm.get('isSalespersonWithTarget')?.valueChanges.subscribe((isSalesperson) => {
                if (!isSalesperson) {
                  dashboardGroup.get('compareAgainst')?.setValue('company');
                  dashboardGroup.get('compareAgainst')?.disable();
                } else {
                  dashboardGroup.get('compareAgainst')?.enable();
                }
              });
              this.categoryForm.patchValue(this.data);
            } else {
              this._toast.error('Category not found');
              this.router.navigate(['/settings']);
            }
          },
          error: () => {
            this._toast.error('Failed to load category');
            this.router.navigate(['/settings']);
          }
        });
      }
    });
  }

  updateChecks(privileges: Privileges) {
    this.dashboardChecked = privileges.dashboard.viewReport !== 'none',
      this.employeeChecked = privileges.employee.viewReport !== 'none',
      this.announcementChecked = privileges.announcement.viewReport !== 'none',
      this.customerChecked = privileges.customer.viewReport !== 'none',
      this.enquiryChecked = privileges.enquiry.viewReport !== 'none',
      this.assignedJobsChecked = privileges.assignedJob.viewReport !== 'none',
      this.quotationChecked = privileges.quotation.viewReport !== 'none',
      this.jobSheetChecked = privileges.jobSheet?.viewReport !== 'none',
      this.purchaseChecked = privileges.purchase?.viewReport !== 'none',
      this.purchaseOrderChecked = privileges.purchaseOrder ?
        ((privileges.purchaseOrder.viewReport ?? 'none') !== 'none' ||
         privileges.purchaseOrder.canInitiateLPO || privileges.purchaseOrder.canApprovePOs || privileges.purchaseOrder.canReissueAndRevoke) : false,
      this.technicalChecked = privileges.technical ? 
        (privileges.technical.viewReport !== 'none' || privileges.technical.canViewOpenToWorkAndAssign || 
         privileges.technical.canTransferToEngineer || privileges.technical.canApproveMRRequests) : false,
      this.supplierChecked = privileges.supplier?.viewReport !== 'none',
      this.inventoryChecked = privileges.inventory ? 
        (privileges.inventory.products?.viewReport !== 'none' || privileges.inventory.stockEntries?.viewReport !== 'none') : false,
      this.dispatchChecked = privileges.dispatch
        ? privileges.dispatch.viewReport !== 'none' ||
          !!privileges.dispatch.createDeliveryNote ||
          !!privileges.dispatch.viewPendingDelivery ||
          !!privileges.dispatch.viewInvoiceLinking ||
          !!privileges.dispatch.viewInventoryDeduction
        : false,
      this.invoiceChecked = privileges.invoice
        ? privileges.invoice.viewReport !== 'none' ||
          !!privileges.invoice.createInvoice ||
          !!privileges.invoice.viewInvoicesVsDn ||
          !!privileges.invoice.viewCancelledAdjusted ||
          !!privileges.invoice.viewReissued
        : false,
      this.claimsChecked = privileges.claims?.viewReport !== 'none',
      this.portalChecked = privileges.portalManagement
        ? Object.values(privileges.portalManagement).some(value => value)
        : false;
  }

  onClose(): void {
    this.router.navigate(['/settings']);
  }

  onCheckboxChange(event: Event, formControlName: string, checkedVariable: 'dashboardChecked' | 'employeeChecked' | 'announcementChecked' | 'customerChecked' | 'enquiryChecked' | 'assignedJobsChecked' | 'quotationChecked' | 'jobSheetChecked' | 'purchaseChecked' | 'purchaseOrderChecked' | 'technicalChecked' | 'supplierChecked' | 'inventoryChecked' | 'dispatchChecked' | 'invoiceChecked' | 'claimsChecked' | 'portalChecked'): void {
    const eventTarget = event.target as HTMLInputElement;
    const checked = eventTarget.checked;

    if (formControlName === 'purchaseOrder') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', canInitiateLPO: false, canApprovePOs: false, canReissueAndRevoke: false } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', canInitiateLPO: false, canApprovePOs: false, canReissueAndRevoke: false } } });
      }
    } else if (formControlName === 'purchase') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', canApprovePR: false } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', canApprovePR: false } } });
      }
    } else if (formControlName === 'inventory') {
      if (checked) {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { products: { viewReport: 'all' }, stockEntries: { viewReport: 'all' } } } });
      } else {
        this.categoryForm.patchValue({ privileges: { [formControlName]: { products: { viewReport: 'none' }, stockEntries: { viewReport: 'none' } } } });
      }
    } else if (formControlName === 'dispatch') {
      if (checked) {
        this.categoryForm.patchValue({
          privileges: {
            dispatch: {
              viewReport: 'all',
              createDeliveryNote: false,
              viewPendingDelivery: false,
              viewInvoiceLinking: false,
              viewInventoryDeduction: false,
            },
          },
        });
      } else {
        this.categoryForm.patchValue({
          privileges: {
            dispatch: {
              viewReport: 'none',
              createDeliveryNote: false,
              viewPendingDelivery: false,
              viewInvoiceLinking: false,
              viewInventoryDeduction: false,
            },
          },
        });
      }
    } else if (formControlName === 'invoice') {
      if (checked) {
        this.categoryForm.patchValue({
          privileges: {
            invoice: {
              viewReport: 'all',
              createInvoice: false,
              viewInvoicesVsDn: false,
              viewCancelledAdjusted: false,
              viewReissued: false,
            },
          },
        });
      } else {
        this.categoryForm.patchValue({
          privileges: {
            invoice: {
              viewReport: 'none',
              createInvoice: false,
              viewInvoicesVsDn: false,
              viewCancelledAdjusted: false,
              viewReissued: false,
            },
          },
        });
      }
    } else if (checked) {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'all', create: false } } });
    } else {
      this.categoryForm.patchValue({ privileges: { [formControlName]: { viewReport: 'none', create: false } } });
    }

    (this as any)[checkedVariable] = checked;

  }

  onSubmit() {
    if (this.categoryForm.valid) {
      this.isSaving = true;

      const categoryData = this.categoryForm.getRawValue();

      this._employeeService.updateCategory(categoryData as unknown as GetCategory, this.data._id).subscribe({
        next: (data) => {
          this.isSaving = false;
          this._toast.success('Category Updated Successfully');
          this.router.navigate(['/settings']);
        },
        error: ((error) => {
          this.isSaving = false;
          this.error = error.error;
        })
      })

    }
  }

  get footerButtons() {
    return [
      {
        label: 'Cancel',
        onClick: this.onClose.bind(this),
        theme: 'cancel' as const
      },
      {
        label: 'Update',
        onClick: this.onSubmit.bind(this),
        theme: 'primary' as const,
        type: 'submit' as const,
        loading: this.isSaving,
        disabled: !this.categoryForm.valid
      }
    ];
  }
}
