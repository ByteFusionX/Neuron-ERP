import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { RadioGroupComponent } from 'src/app/shared/components/forms/radio-group/radio-group.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TagInputComponent } from 'src/app/shared/components/forms/tag-input/tag-input.component';
import { SupplierService } from 'src/app/core/services/supplier.service';
import { ToastrService } from 'ngx-toastr';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Department, getDepartment } from 'src/app/shared/interfaces/department.interface';
import { FileUploadModalComponent, FileUploadModalData } from 'src/app/shared/components/file-upload-modal/file-upload-modal.component';
import { IconsModule } from 'src/app/lib/icons/icons.module';

@Component({
  selector: 'app-create-supplier',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    FormFieldComponent,
    RadioGroupComponent,
    ButtonComponent,
    SelectDropdownComponent,
    IconsModule,
    MatTooltipModule
  ],
  templateUrl: './create-supplier.component.html',
  styleUrl: './create-supplier.component.css',
})
export class CreateSupplierComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supplierService = inject(SupplierService);
  private departmentService = inject(ProfileService);
  private employeeService = inject(EmployeeService);
  private notificationService = inject(ToastrService);
  private dialog = inject(MatDialog);
  selectedFiles: File[] = []
  bankDocumentFiles: File[] = [];
  existingDocuments: { fileName: string; originalname: string }[] = [];

  // Signals
  departments = signal<getDepartment[]>([]);
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  supplierExists = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  showBankDetails = signal<boolean>(false);

  toggleBankDetails(): void {
    this.showBankDetails.update(v => !v);
  }

  openDocumentsUpload(): void {
    const modalData: FileUploadModalData = {
      title: 'Upload Documents',
      existingFiles: [
        ...this.existingDocuments.map(doc => ({ fileName: doc.fileName, originalname: doc.originalname, isUploaded: true })),
        ...this.selectedFiles.map(file => ({ fileName: '', originalname: file.name, file, isUploaded: false }))
      ],
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
      showActions: {
        upload: true,
        download: true,
        view: true,
        delete: true
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        this.existingDocuments = result.files
          .filter((file: any) => file.isUploaded)
          .map((file: any) => ({ fileName: file.fileName, originalname: file.originalname }));
        this.selectedFiles = result.files
          .filter((file: any) => !file.isUploaded && file.file)
          .map((file: any) => file.file);
      }
    });
  }

  openBankDocumentUpload(): void {
    const modalData: FileUploadModalData = {
      title: 'Upload Banking Documents',
      existingFiles: this.bankDocumentFiles.map(file => ({ fileName: '', originalname: file.name, file, isUploaded: false })),
      allowMultiple: true,
      acceptedTypes: '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx',
      maxFileSize: 10 * 1024 * 1024,
      showActions: {
        upload: true,
        download: false,
        view: true,
        delete: true
      }
    };

    const dialogRef = this.dialog.open(FileUploadModalComponent, {
      data: modalData,
      width: '800px',
      maxHeight: '90vh'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'save') {
        this.bankDocumentFiles = result.files
          .filter((file: any) => file.file)
          .map((file: any) => file.file);
      }
    });
  }

  // Form Data
  supplierTypes = [
    { id: 'OEM', name: 'OEM' },
    { id: 'Distributor', name: 'Distributor' },
    { id: 'Super Stockiest', name: 'Super Stockiest' },
    { id: 'Reseller', name: 'Reseller' }
  ];

  // categories = signal<Department[]>([]);

  supplierForm: FormGroup = this.fb.group({
    supplierId: [{ value: 'NT-SP-', disabled: true }],
    supplierName: ['', [Validators.required]],
    address: this.fb.group({
      streetNo: [''],
      zoneNo: [''],
      buildingNo: [''],
      poBox: [''],
      location: ['', Validators.required]
    }),
    supplierType: ['', [Validators.required]],
    category: ['', [Validators.required]],
    contactDetails: this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]]
    }),
    bankDetails: this.fb.group({
      bankName: [''],
      branch: [''],
      accountName: [''],
      accountNumber: [''],
      iban: [''],
      swiftCode: [''],
      currency: [''],
      bankCountry: [''],
      bankAddress: ['']
    }),
    products: this.fb.array([]),
    creditDays: [30, [Validators.required, Validators.min(0)]],
    creditValue: [0, [Validators.required, Validators.min(0)]]
  });

  ngOnInit(): void {
    this.loadDepartments();
    this.checkEditMode();
    this.watchCategoryChanges();
  }

  private watchCategoryChanges(): void {
    this.supplierForm.get('category')?.valueChanges.subscribe((categoryId: string) => {
      if (!categoryId) {
        this.supplierForm.get('supplierId')?.setValue('NT-SP-');
        return;
      }

      this.supplierService.previewSupplierId(categoryId).subscribe({
        next: (response) => {
          const preview = this.isEditMode()
            ? this.applyDepartmentToExistingCode(response.data.departmentCode)
            : response.data.supplierId;
          this.supplierForm.get('supplierId')?.setValue(preview);
        },
        error: (error) => {
          console.error('Error previewing supplier id:', error);
        }
      });
    });
  }

  private applyDepartmentToExistingCode(departmentCode: string): string {
    const currentCode = this.supplierForm.get('supplierId')?.value as string;
    const parts = currentCode?.split('-');
    if (parts?.length === 5) {
      parts[2] = departmentCode;
      return parts.join('-');
    }
    return currentCode;
  }

  private loadDepartments(): void {
    this.departmentService.getDepartments().subscribe({
      next: (data) => {
        this.departments.set(data);
      },
      error: (error) => {
        this.notificationService.error('Failed to load departments');
        console.error('Error loading departments:', error);
      }
    });
  }

  private checkEditMode(): void {
    const supplierId = this.route.snapshot.paramMap.get('id');
    if (supplierId) {
      this.isEditMode.set(true);
      this.loadSupplierData(supplierId);
    }
  }

  private loadSupplierData(supplierId: string): void {
    this.supplierService.getSupplierById(supplierId).subscribe({
      next: (response) => {
        const supplier = response.data;
        console.log(supplier);
        this.populateForm(supplier);
      },
      error: (error) => {
        this.notificationService.error('Failed to load supplier data');
        console.error('Error loading supplier:', error);
        this.router.navigate(['/suppliers/pendings']);
      }
    });
  }

  private populateForm(supplier: any): void {
    // First clear any existing products
    const productsArray = this.supplierForm.get('products') as FormArray;
    productsArray.clear();

    // Patch the main form values
    this.supplierForm.patchValue({
      supplierId: supplier.supplierId || 'NT-SP-',
      supplierName: supplier.supplierName || '',
      supplierType: supplier.supplierType || '',
      category: supplier.category?._id || supplier.category || '',
      creditDays: supplier.creditDays || 30,
      creditValue: supplier.creditValue || 0
    });

    // Patch address form group
    if (supplier.address) {
      const addressGroup = this.supplierForm.get('address') as FormGroup;
      addressGroup.patchValue({
        streetNo: supplier.address.streetNo || '',
        zoneNo: supplier.address.zoneNo || '',
        buildingNo: supplier.address.buildingNo || '',
        poBox: supplier.address.poBox || '',
        location: supplier.address.location || '',
        city: supplier.address.city || ''
      });
    }

    // Patch primary contact form group
    if (supplier.contactDetails) {
      console.log(supplier.contactDetails);
      const contactGroup = this.supplierForm.get('contactDetails') as FormGroup;
      contactGroup.patchValue({
        name: supplier.contactDetails.name || '',
        email: supplier.contactDetails.email || '',
        phoneNumber: supplier.contactDetails.phoneNumber || ''
      });
    }

    // Patch bank details form group
    if (supplier.bankDetails) {
      const bankGroup = this.supplierForm.get('bankDetails') as FormGroup;
      bankGroup.patchValue({
        bankName: supplier.bankDetails.bankName || '',
        branch: supplier.bankDetails.branch || '',
        accountName: supplier.bankDetails.accountName || '',
        accountNumber: supplier.bankDetails.accountNumber || '',
        iban: supplier.bankDetails.iban || '',
        swiftCode: supplier.bankDetails.swiftCode || '',
        currency: supplier.bankDetails.currency || '',
        bankCountry: supplier.bankDetails.bankCountry || '',
        bankAddress: supplier.bankDetails.bankAddress || ''
      });
    }

    // Add products to the form array
    if (supplier.products && Array.isArray(supplier.products)) {
      supplier.products.forEach((product: any) => {
        const productGroup = this.fb.group({
          productName: [product.productName || '', [Validators.required]],
          paymentTerm: [product.paymentTerm || '', [Validators.required]],
          contactName: [product.contactName || ''],
          contactEmail: [product.contactEmail || '', [Validators.email]],
          contactNo: [product.contactNo || '']
        });
        productsArray.push(productGroup);
      });
    }

    this.existingDocuments = supplier.documents || [];

    // Mark the form as pristine and untouched after population
    this.supplierForm.markAsPristine();
    this.supplierForm.markAsUntouched();
  }

  createProductFormGroup(): FormGroup {
    return this.fb.group({
      productName: ['', [Validators.required]],
      paymentTerm: ['', [Validators.required]],
      contactName: [''],
      contactEmail: ['', [Validators.email]],
      contactNo: ['']
    });
  }

  get productsFormArray(): FormArray {
    return this.supplierForm.get('products') as FormArray;
  }

  addProductFormGroup(): void {
    this.productsFormArray.push(this.createProductFormGroup());
  }

  removeProductFormGroup(index: number): void {
      this.productsFormArray.removeAt(index);
  }

  hasProductsErrors(): boolean {
    if (!this.isSubmitted()) return false;
    
    for (let i = 0; i < this.productsFormArray.controls.length; i++) {
      const control = this.productsFormArray.controls[i];
      if (control.invalid) {
        return true;
      }
    }
    
    return false;
  }

  onAddressFormChange(addressData: any): void {
    this.supplierForm.patchValue({ address: addressData });
  }

  oncontactDetailsChange(contactData: any): void {
    this.supplierForm.patchValue({ contactDetails: contactData });
  }

  onSubmit(): void {
    this.isSubmitted.set(true);
    
    if (this.supplierForm.invalid) {
      this.notificationService.error('Please fill all required fields correctly');
      return;
    }

    this.isSaving.set(true);
    
    if (this.isEditMode()) {
      const supplierId = this.route.snapshot.paramMap.get('id');
      if (!supplierId) {
        this.notificationService.error('Invalid supplier ID');
        return;
      }

      this.supplierService.updateSupplierWithFiles(supplierId, this.supplierForm.value, this.selectedFiles).subscribe({
        next: () => {
          this.notificationService.success('Supplier updated successfully');
          this.router.navigate(['/suppliers/pendings']);
        },
        error: (error: Error) => {
          this.isSaving.set(false);
          this.notificationService.error('Failed to update supplier');
          console.error('Error updating supplier:', error);
        }
      });
    } else {
      const employeeId = this.employeeService.employeeToken()?.id;
      const supplierData = {
        ...this.supplierForm.value,
        createdBy: employeeId
      };

      this.supplierService.createSupplierWithFiles(supplierData, this.selectedFiles).subscribe({
        next: () => {
          this.notificationService.success('Supplier created successfully');
          this.router.navigate(['/suppliers/pendings']);
        },
        error: (error) => {
          this.isSaving.set(false);
          if (error?.error?.message === 'Supplier already exists') {
            this.supplierExists.set(true);
          } else {
            this.notificationService.error('Failed to create supplier');
          }
          console.error('Error creating supplier:', error);
        }
      });
    }
  }

  // Helper for template form access
  get f() {
    return this.supplierForm.controls;
  }
}