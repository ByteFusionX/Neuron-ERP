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

  private readonly _destroying$ = new Subject<void>();
  
  constructor(
    private router: Router,
    private _dialog:MatDialog,
    private msalService: MsalService,
    private msalBroadcastService: MsalBroadcastService,
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

  loginWithMicrosoft(){
    if (!this.msalService.instance.getAllAccounts().length) {
      this.msalService.loginPopup().subscribe((response: AuthenticationResult) => {
        this.setLoginDisplay();
        this.msalService.instance.setActiveAccount(this.activeAccount);
        this.router.navigate(['/home']);
      });
    }
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

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
