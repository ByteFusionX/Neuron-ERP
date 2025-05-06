import { Component } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CreateEmployeeDialog } from 'src/app/modules/home/pages/employees/create-employee/create-employee.component';
import { login } from 'src/app/shared/interfaces/login';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.css'],
    imports: [NgIf, FormsModule, ReactiveFormsModule, NgIcon]
})
export class LoginPageComponent {

  submit: boolean = false
  employeeNotFoundError: boolean = false
  passwordNotMatchError: boolean = false
  isSaving: boolean = false;
  isEmployeePresent: boolean = true;


  showPassword: boolean = false;
  passwordType: string = this.showPassword ? 'text' : 'password';
  showIcon: string = this.showPassword ? 'heroEye' : 'heroEyeSlash';

  constructor(
    private employeeService: EmployeeService,
    private _fb: FormBuilder,
    private router: Router,
    private _dialog:MatDialog,
    private _notificationService: NotificationService,
  ) { }

  loginForm = this._fb.group({
    employeeId: ['', Validators.required],
    password: ['', Validators.required]
  })

  ngOnInit() {
    this.employeeService.isEmployeePresent().subscribe((res) => {
      this.isEmployeePresent = res.exists;
    })
  }

  onCreateSuperAdmin(){
    const dialogRef = this._dialog.open(CreateEmployeeDialog,{
      data:{
        createSuperAdmin : true
      }
    });
    dialogRef.close((data: any)=>{
      if(data){
        this.isEmployeePresent = true;
      }
    })
  }

  passwordShow() {
    this.showPassword = !this.showPassword
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  }

  onSubmit() {
    this.submit = true
    if (this.loginForm.valid) {
      this.isSaving = true;
      this.employeeService.employeeLogin(this.loginForm.value).subscribe((res: login) => {
        if (res.employeeData && res.token) {
          localStorage.setItem('employeeToken', res.token)
          this.router.navigate(['/home']);
          if (res.token) {
            this._notificationService.authSocketIo(res.token)
            this._notificationService.getEmployeeNotifications(res.token)
            this._notificationService.initializeNotifications()
          }
        }
        else if (res.employeeNotFoundError) {
          this.isSaving = false;
          this.employeeNotFoundError = true;

        } else if (res.passwordNotMatchError) {
          this.isSaving = false;
          this.passwordNotMatchError = true
        }
      })
    }
  }
}
