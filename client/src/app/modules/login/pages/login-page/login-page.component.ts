import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CreateEmployeeDialog } from 'src/app/modules/employees/create-employee/create-employee.component';
import { login } from 'src/app/shared/interfaces/login';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, InteractionStatus } from '@azure/msal-browser';
import { filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';

// Azure AD login is temporarily disabled in favor of employeeId/password login
// (see login-page.component.html: the "Continue with Microsoft" block is commented out).
// To re-enable Azure: uncomment that block, and swap the interceptor/guards back
// (app.config.ts, auth.guard.ts, login.guard.ts) to their Azure/MsalService checks.
@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.css'],
    imports: [NgIf, FormsModule, ReactiveFormsModule, NgIcon, appNoLeadingSpace]
})
export class LoginPageComponent implements OnDestroy {
  isEmployeePresent: boolean = true;
  loginDisplay = false;
  activeAccount: any | null = null;
  isMicrosoftLoginLoading: boolean = false;
  isSuperAdminLoading: boolean = false;

  // employeeId/password login state
  submit: boolean = false;
  employeeNotFoundError: boolean = false;
  passwordNotMatchError: boolean = false;
  isSaving: boolean = false;
  showPassword: boolean = false;
  passwordType: string = this.showPassword ? 'text' : 'password';
  showIcon: string = this.showPassword ? 'heroEye' : 'heroEyeSlash';

  loginForm = this._fb.group({
    employeeId: ['', Validators.required],
    password: ['', Validators.required]
  })

  private readonly _destroying$ = new Subject<void>();

  constructor(
    private router: Router,
    private _dialog: MatDialog,
    private msalService: MsalService,
    private employeeService: EmployeeService,
    private msalBroadcastService: MsalBroadcastService,
    private notificationService: NotificationService,
    private toastr: ToastrService,
    private _fb: FormBuilder,
  ) { }

  ngOnInit(): void {
    this.employeeService.isEmployeePresent().subscribe((res) => {
      this.isEmployeePresent = res.exists;
    })

    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this._destroying$)
      )
      .subscribe((response: InteractionStatus) => {
        this.setLoginDisplay();
        this.setActiveAccount();
      });
  }

  passwordShow() {
    this.showPassword = !this.showPassword
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  }

  onSubmit() {
    this.submit = true
    this.employeeNotFoundError = false
    this.passwordNotMatchError = false
    if (this.loginForm.valid) {
      this.isSaving = true;
      this.employeeService.employeeLogin(this.loginForm.value).subscribe({
        next: (res: login) => {
          if (res.employeeData && res.token) {
            localStorage.setItem('employeeToken', res.token)
            this.notificationService.authSocketIo(res.token)
            this.notificationService.initializeNotifications()
            this.router.navigate(['/home']);
          } else if (res.employeeNotFoundError) {
            this.isSaving = false;
            this.employeeNotFoundError = true;
          } else if (res.passwordNotMatchError) {
            this.isSaving = false;
            this.passwordNotMatchError = true
          }
        },
        error: () => {
          this.isSaving = false;
        }
      })
    }
  }

  setLoginDisplay() {
    this.loginDisplay = this.msalService.instance.getAllAccounts().length > 0;
  }

  setActiveAccount() {
    this.activeAccount = this.msalService.instance.getActiveAccount() || this.msalService.instance.getAllAccounts()[0];
  }

  loginEmployee(){
    this.employeeService.employeeLoginWithMicrosoft().subscribe({
      next: (data: any) => {
        this.isMicrosoftLoginLoading = false;
        this.router.navigate(['/home']);
      },
      error: (error: any) => {
        this.isMicrosoftLoginLoading = false;
        this.toastr.error('Microsoft login failed. Please try again.');
      }
    })
  }

  loginWithMicrosoft(){
    if (!this.msalService.instance.getAllAccounts().length) {
      localStorage.clear();
      sessionStorage.clear();
      this.isMicrosoftLoginLoading = true;
      this.msalService.loginPopup({
        prompt : 'select_account',
        scopes : ['user.read']
      }).subscribe({
        next: (response: AuthenticationResult) => {
          this.setLoginDisplay();
          this.msalService.instance.setActiveAccount(this.activeAccount);
          this.loginEmployee();
        },
        error: (error: any) => {
          this.isMicrosoftLoginLoading = false;
          console.error('Microsoft login failed:', error);
          this.toastr.error('Microsoft login failed. Please try again.');
        }
      });
    }
  }

  onCreateSuperAdmin(){
    this.isSuperAdminLoading = true;
    const dialogRef = this._dialog.open(CreateEmployeeDialog,{
      data:{
        createSuperAdmin : true
      }
    });

    dialogRef.afterClosed().subscribe({
      next: (data: any) => {
        this.isSuperAdminLoading = false;
        if(data){
          this.isEmployeePresent = true;
          this.toastr.success('Super admin account created successfully!');
        }
      },
      error: (error: any) => {
        this.isSuperAdminLoading = false;
        console.error('Super admin creation failed:', error);
        this.toastr.error('Failed to create super admin account. Please try again.');
      }
    });
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
