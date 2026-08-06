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
import { MsalService } from '@azure/msal-angular';
import { AuthenticationResult } from '@azure/msal-browser';
import { environment } from 'src/environments/environment';

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
  microsoftAccountNotLinkedError: boolean = false
  isSaving: boolean = false;
  isSigningInWithMicrosoft: boolean = false;
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
    private _msalService: MsalService,
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
          this.handleLoginSuccess(res.token);
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

  loginWithMicrosoft() {
    this.microsoftAccountNotLinkedError = false;
    this.isSigningInWithMicrosoft = true;
    const scopes = [`api://${environment.microsoftClientId}/access_as_user`];
    this._msalService.loginPopup({ scopes }).subscribe({
      next: (result: AuthenticationResult) => {
        this.employeeService.employeeLoginWithMicrosoft(result.accessToken).subscribe({
          next: (res: login) => {
            if (res.employeeData && res.token) {
              this.handleLoginSuccess(res.token);
            } else {
              this.isSigningInWithMicrosoft = false;
              this.microsoftAccountNotLinkedError = true;
            }
          },
          error: () => {
            this.isSigningInWithMicrosoft = false;
            this.microsoftAccountNotLinkedError = true;
          }
        });
      },
      error: () => {
        this.isSigningInWithMicrosoft = false;
      }
    });
  }

  private handleLoginSuccess(token: string) {
    localStorage.setItem('employeeToken', token)
    this.router.navigate(['/home']);
    this._notificationService.authSocketIo(token)
    this._notificationService.getEmployeeNotifications(token)
    this._notificationService.initializeNotifications()
  }
}
