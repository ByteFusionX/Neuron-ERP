import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { AddressFormComponent } from 'src/app/shared/components/forms/address-form/address-form.component';
import { ContactDetailsFormComponent } from 'src/app/shared/components/forms/contact-details-form/contact-details-form.component';
import { RadioGroupComponent } from 'src/app/shared/components/forms/radio-group/radio-group.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TagInputComponent } from 'src/app/shared/components/forms/tag-input/tag-input.component';

@Component({
  selector: 'app-create-supplier',
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    RouterLink,
    AddressFormComponent,
    ContactDetailsFormComponent,
    FormFieldComponent,
    RadioGroupComponent,
    ButtonComponent,
    SelectDropdownComponent
  ],
  templateUrl: './create-supplier.component.html',
  styleUrl: './create-supplier.component.css',
})
export class CreateSupplierComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  // private supplierService = inject(SupplierService);
  // private departmentService = inject(DepartmentService);
  // private notificationService = inject(NotificationService);

  // Signals
  // departments = signal<Department[]>([]);
  isSaving = signal<boolean>(false);
  isSubmitted = signal<boolean>(false);
  supplierExists = signal<boolean>(false);
  
  // Form Data
  supplierTypes = [
    { id: 'OEM', name: 'OEM' },
    { id: 'Distributor', name: 'Distributor' },
    { id: 'Super Stockiest', name: 'Super Stockiest' },
    { id: 'Reseller', name: 'Reseller' }
  ];

  // categories = signal<Department[]>([]);

  supplierForm: FormGroup = this.fb.group({
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
    primaryContact: this.fb.group({
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', [Validators.required]]
    }),
    products: this.fb.array([
      this.createProductFormGroup()
    ]),
    creditDays: [30, [Validators.required, Validators.min(0)]],
    creditValue: [0, [Validators.required, Validators.min(0)]]
  });

  ngOnInit(): void {
    this.loadDepartments();
  }

  private loadDepartments(): void {
    // this.departmentService.getDepartments().subscribe({
    //   next: (data) => {
    //     this.departments.set(data);
    //     this.categories.set(data);
    //   },
    //   error: (error) => {
    //     this.notificationService.showError('Failed to load departments');
    //     console.error('Error loading departments:', error);
    //   }
    // });
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
    if (this.productsFormArray.length > 1) {
      this.productsFormArray.removeAt(index);
    }
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

  onPrimaryContactChange(contactData: any): void {
    this.supplierForm.patchValue({ primaryContact: contactData });
  }

  onSubmit(): void {
    this.isSubmitted.set(true);
    
    console.log(this.supplierForm.value);
    if (this.supplierForm.invalid) {
      // this.notificationService.showError('Please fill all required fields correctly');
      return;
    }
    
    this.isSaving.set(true);
    
    // this.supplierService.createSupplier(this.supplierForm.value).subscribe({
    //   next: () => {
    //     this.notificationService.showSuccess('Supplier created successfully');
    //     this.router.navigate(['/suppliers']);
    //   },
    //   error: (error) => {
    //     this.isSaving.set(false);
    //     if (error?.error?.message === 'Supplier already exists') {
    //       this.supplierExists.set(true);
    //     } else {
    //       this.notificationService.showError('Failed to create supplier');
    //     }
    //     console.error('Error creating supplier:', error);
    //   }
    // });
  }

  // Helper for template form access
  get f() {
    return this.supplierForm.controls;
  }
}