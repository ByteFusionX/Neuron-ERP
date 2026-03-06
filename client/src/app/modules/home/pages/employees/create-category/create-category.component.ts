
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { GetCategory, Privileges } from 'src/app/shared/interfaces/employee.interface';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../../shared/directives/trim-validator.directive';
import { NgIf } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { PageLayoutComponent } from 'src/app/shared/components/page-layout/page-layout.component';

@Component({
    selector: 'app-create-category',
    templateUrl: './create-category.component.html',
    styleUrls: ['./create-category.component.css'],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, appNoLeadingSpace, NgIf, PageLayoutComponent]
})

export class CreateCategoryComponent implements OnInit {
  isSaving: boolean = false;
  error!: string;

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
  claimsChecked: boolean = false;
  dispatchChecked: boolean = false;
  invoiceChecked: boolean = false;
  portalChecked: boolean = false;

  constructor(
    private router: Router,
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
        deleteOrEdit: [false],
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
      claims: this._fb.group({
        viewReport: 'none',
        canApprove: [false],
      }),
      dispatch: this._fb.group({
        viewReport: 'none',
        viewPendingDelivery: [false],
        viewInvoiceLinking: [false],
        viewInventoryDeduction: [false],
        createDeliveryNote: [false],
      }),
      invoice: this._fb.group({
        viewReport: 'none',
        viewInvoicesVsDn: [false],
        viewCancelledAdjusted: [false],
        viewReissued: [false],
        createInvoice: [false],
        updateQuantities: [false],
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
    const dashboardGroup = this.categoryForm.get('privileges.dashboard') as FormGroup;
    dashboardGroup.get('compareAgainst')?.disable();

    this.categoryForm.get('isSalespersonWithTarget')?.valueChanges.subscribe((isSalesperson) => {
      if (!isSalesperson) {
        dashboardGroup.get('compareAgainst')?.setValue('company');
        dashboardGroup.get('compareAgainst')?.disable();
      } else {
        dashboardGroup.get('compareAgainst')?.enable();
      }
    });
  }

  onClose(): void {
    if (window.opener) {
      window.close();
    } else {
      const currentUrl = this.router.url;
      if (currentUrl.includes('/settings')) {
        this.router.navigate(['/settings']);
      } else {
        this.router.navigate(['/home/employees']);
      }
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
        label: 'Create',
        onClick: this.onSubmit.bind(this),
        theme: 'primary' as const,
        type: 'submit' as const,
        loading: this.isSaving,
        disabled: !this.categoryForm.valid
      }
    ];
  }

  onCheckboxChange(event: Event, formControlName: string, checkedVariable: 'dashboardChecked' | 'employeeChecked' | 'announcementChecked' | 'customerChecked' | 'enquiryChecked' | 'assignedJobsChecked' | 'quotationChecked' | 'jobSheetChecked' | 'purchaseChecked' | 'purchaseOrderChecked' | 'technicalChecked' | 'supplierChecked' | 'inventoryChecked' | 'claimsChecked' | 'dispatchChecked' | 'invoiceChecked' | 'portalChecked'): void {
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

      const categoryData = this.categoryForm.getRawValue() ;

      this._employeeService.createCategory(categoryData as unknown as GetCategory).subscribe({
        next: (data) => {
          this.isSaving = false;
          this._toast.success('Category Created Successfully');
          if (window.opener) {
            window.opener.postMessage({ type: 'categoryCreated', data: data }, '*');
            window.close();
          } else {
            const currentUrl = this.router.url;
            if (currentUrl.includes('/settings')) {
              this.router.navigate(['/settings']);
            } else {
              this.router.navigate(['/home/employees']);
            }
          }
        },
        error: ((error) => {
          this.isSaving = false;
          this.error = error.error;
        })
      })

    }
  }
}
