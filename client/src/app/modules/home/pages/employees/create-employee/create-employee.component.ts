import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment, getInternalDep } from 'src/app/shared/interfaces/department.interface';
import { CreateEmployee, GetCategory, getEmployee } from 'src/app/shared/interfaces/employee.interface';
import { CreateCategoryComponent } from '../create-category/create-category.component';
import { ToastrService } from 'ngx-toastr';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgIconComponent } from '@ng-icons/core';
import { CommonModule } from '@angular/common';

import { appNoLeadingSpace } from '../../../../../shared/directives/trim-validator.directive';
import { dateFutureDirective } from '../../../../../shared/directives/date-future.directive';

@Component({
    selector: 'app-create-employee',
    templateUrl: './create-employee.component.html',
    styleUrls: ['./create-employee.component.css'],
    imports: [
    NgSelectModule,
    NgIconComponent,
    CommonModule,
    ReactiveFormsModule,
    appNoLeadingSpace,
    dateFutureDirective
]
})
export class CreateEmployeeDialog implements OnInit {
  category$: BehaviorSubject<GetCategory[]> = new BehaviorSubject<GetCategory[]>([]);
  departments$!: Observable<getInternalDep[]>;
  employees$!: Observable<getEmployee[]>;

  selectedEmployee!: number;
  showPassword: boolean = false;
  passwordType: string = this.showPassword ? 'text' : 'password';
  showIcon: string = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  isSaving: boolean = false;
  canCreateCategory: boolean = false;
  userRole: string = 'user';

  employeeForm = this._fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    designation: ['', Validators.required],
    dob: ['', Validators.required],
    department: ['', Validators.required],
    contactNo: ['', Validators.required],
    category: ['', Validators.required],
    dateOfJoining: ['', Validators.required],
    reportingTo: [''],
    password: ['', [Validators.required, Validators.pattern(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]).{8,}$/)]]
  })

  constructor(
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<CreateEmployeeDialog>,
    @Inject(MAT_DIALOG_DATA) public data: {createSuperAdmin:boolean},
    private _fb: FormBuilder,
    private _profileService: ProfileService,
    private _employeeService: EmployeeService,
    private _toast: ToastrService
  ) { }

  ngOnInit() {
    this.getCategory();
    this.departments$ = this._profileService.getInternalDepartments();
    this.employees$ = this._employeeService.getAllEmployees();
    this._employeeService.employeeData$.subscribe((data) => {
      this.userRole = data?.category.role as string;
      if (data?.category.role == 'superAdmin') {
        this.canCreateCategory = true;
      }
    })
  }

  getCategory() {
    this._employeeService.getCategory().subscribe(data => {
      let categories = data;
      if (this.userRole == 'admin') {
        categories = data.filter((value) => {
          return value.role == 'admin' || value.role == 'user';
        });
      }else if(this.userRole == 'user'){
        categories = data.filter((value) => {
          return value.role == 'user'
        })
      }
      this.category$.next(categories);
    });
  }

  onSubmit() {
    if (this.employeeForm.valid) {
      this.isSaving = true;

      let userId;
      this._employeeService.employeeData$.subscribe((employee) => {
        userId = employee?._id
      })

      const selectedReportingTo = this.employeeForm.get('reportingTo')?.value;
      const reportingToValue = selectedReportingTo === '' ? null : selectedReportingTo;
      const employeeData: CreateEmployee = this.employeeForm.value as CreateEmployee;
      
      employeeData.createdBy = userId;
      employeeData.reportingTo = reportingToValue;

      this._employeeService.createEmployees(employeeData).subscribe((data) => {
        this.isSaving = false;
        this.dialogRef.close(data)
      })
    }
  }

  createCategory() {
    const dialogRef = this.dialog.open(CreateCategoryComponent, {
      width: '100vh'
    });
    dialogRef.afterClosed().subscribe((data) => {
      if (data) {
        const currentCategories = this.category$.getValue();
        const updatedCategories = [...currentCategories, data];
        this.category$.next(updatedCategories);

        this._toast.success('Category Created Successfully')
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  passwordShow() {
    this.showPassword = !this.showPassword
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  }

  generateRandomPassword(): string {
    this.showPassword = true;
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';

    const capitalLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const smallLetters = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+{}[]';

    const allChars = capitalLetters + smallLetters + numbers + specialChars;

    let password = '';

    password += capitalLetters[Math.floor(Math.random() * capitalLetters.length)];
    password += smallLetters[Math.floor(Math.random() * smallLetters.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    for (let i = 4; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    const shuffledPassword: string | null = password.split('').sort(() => 0.5 - Math.random()).join('');
    this.employeeForm.patchValue({ password: shuffledPassword })
    return shuffledPassword;
  }


}
