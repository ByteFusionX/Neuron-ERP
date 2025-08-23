import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { CreateEmployeeDialog } from 'src/app/modules/home/pages/employees/create-employee/create-employee.component';
import { login } from 'src/app/shared/interfaces/login';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, InteractionStatus } from '@azure/msal-browser';
import { filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.css'],
    imports: [NgIf, FormsModule, ReactiveFormsModule, NgIcon]
})
export class LoginPageComponent implements OnDestroy {
  isEmployeePresent: boolean = true;
  loginDisplay = false;
  activeAccount: any | null = null;
  isMicrosoftLoginLoading: boolean = false;
  isSuperAdminLoading: boolean = false;

  private readonly _destroying$ = new Subject<void>();
  
  constructor(
    private router: Router,
    private _dialog: MatDialog,
    private msalService: MsalService,
    private employeeService: EmployeeService,
    private msalBroadcastService: MsalBroadcastService,
    private notificationService: NotificationService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
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
