import { Component, Inject } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { getDepartment, getInternalDep } from 'src/app/shared/interfaces/department.interface';
import { CreateEmployee, GetCategory, getEmployee, getEmployeeDetails } from 'src/app/shared/interfaces/employee.interface';
import { CreateCategoryComponent } from '../create-category/create-category.component';
import { ToastrService } from 'ngx-toastr';
import { CreateEmployeeDialog } from '../create-employee/create-employee.component';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { appNoLeadingSpace } from '../../../../../shared/directives/trim-validator.directive';
import { NgIf, NgFor, AsyncPipe, TitleCasePipe } from '@angular/common';
import { NgSelectComponent, NgOptionComponent, NgFooterTemplateDirective } from '@ng-select/ng-select';
import { dateFutureDirective } from '../../../../../shared/directives/date-future.directive';

@Component({
    selector: 'app-edit-employee',
    templateUrl: './edit-employee.component.html',
    styleUrls: ['./edit-employee.component.css'],
    imports: [NgIcon, FormsModule, ReactiveFormsModule, appNoLeadingSpace, NgIf, NgFor, NgSelectComponent, NgOptionComponent, NgFooterTemplateDirective, dateFutureDirective, AsyncPipe, TitleCasePipe]
})
export class EditEmployeeComponent {

  category$: BehaviorSubject<GetCategory[]> = new BehaviorSubject<GetCategory[]>([]);
  departments$!: Observable<getInternalDep[]>;
  employees$!: Observable<getEmployee[]>;
  employeeData!: getEmployeeDetails;

  userRole: string = 'user';

  canCreateCategory: boolean = false;
  isSaving: boolean = false;
  changePasswordChoice: boolean = true
  canGeneratePassword: boolean = false
  showPassword: boolean = false;
  isChangePasswordButton: boolean = true;

  passwordType: string = this.showPassword ? 'text' : 'password';
  showIcon: string = this.showPassword ? 'heroEye' : 'heroEyeSlash';

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
    password: [{ value: '', disabled: true }, [Validators.required, Validators.pattern(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]).{8,}$/)]]
  })

  constructor(private _fb: FormBuilder,
    private _router: Router,
    private _profileService: ProfileService,
    private _employeeService: EmployeeService,
    public dialog: MatDialog,
    private _toast: ToastrService,
    public dialogRef: MatDialogRef<CreateEmployeeDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { employeeData: getEmployeeDetails }
  ) { }

  ngOnInit() {
    this.getCategory();
    this.departments$ = this._profileService.getInternalDepartments();
    this.employees$ = this._employeeService.getAllEmployees();
    
    this.employeeForm.patchValue({
      firstName: this.data.employeeData.firstName,
      lastName: this.data.employeeData.lastName,
      email: this.data.employeeData.email,
      designation: this.data.employeeData.designation,
      dob: this.data.employeeData.dob.substring(0, 10),
      department: this.data.employeeData.department._id,
      contactNo: this.data.employeeData.contactNo as string,
      category: this.data.employeeData.category._id,
      dateOfJoining: this.data.employeeData.dateOfJoining.substring(0, 10),
      reportingTo: this.data.employeeData.reportingTo?._id,
      password: ''
    });
  }

  getCategory() {
    this._employeeService.getCategory().subscribe(data => {
      let categories = data;
      this.category$.next(categories);
    });
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


  onSubmit() {
    if (this.employeeForm.valid) {
      this.isSaving = true;

      const employeeData = this.employeeForm.value as CreateEmployee
      employeeData.employeeId = this.data.employeeData._id as string

      const selectedReportingTo = this.employeeForm.get('reportingTo')?.value;
      const reportingToValue = selectedReportingTo === '' ? null : selectedReportingTo;

      employeeData.reportingTo = reportingToValue;

      this._employeeService.editEmployees(employeeData as CreateEmployee).subscribe((data) => {
        this.isSaving = false;
        this.dialogRef.close(data)
      })
    }
  }

  changePasswordChoiceButton() {
    this.changePasswordChoice = false;
    this.canGeneratePassword = true;
    this.employeeForm.get('password')?.enable();
    this.employeeForm.patchValue({
      password: ''
    })
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

  passwordShow() {
    this.showPassword = !this.showPassword
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  }
}
