import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {
  AccountInfo,
  AuthenticationResult,
  BrowserAuthError,
  InteractionRequiredAuthError,
  InteractionStatus,
} from '@azure/msal-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { filter, Subject, takeUntil } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { login } from 'src/app/shared/interfaces/login';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css'],
  imports: [NgIf],
})
export class LoginPageComponent implements OnInit, OnDestroy {
  activeAccount: AccountInfo | null = null;
  isMicrosoftLoginLoading = false;

  private readonly loginScopes = [environment.microsoftApiUrl];
  private readonly destroying$ = new Subject<void>();

  constructor(
    private router: Router,
    private msalService: MsalService,
    private employeeService: EmployeeService,
    private msalBroadcastService: MsalBroadcastService,
    private notificationService: NotificationService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.msalService.handleRedirectObservable()
      .pipe(takeUntil(this.destroying$))
      .subscribe({
        next: (result) => {
          if (!result?.account) return;
          this.setActiveAccount(result.account);
          this.isMicrosoftLoginLoading = true;
          result.accessToken ? this.finishLogin(result.accessToken) : this.loginEmployee();
        },
        error: (error) => this.handleMicrosoftLoginError(error),
      });

    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this.destroying$),
      )
      .subscribe(() => this.restoreActiveAccount());
  }

  loginWithMicrosoft(): void {
    this.restoreActiveAccount();
    if (this.activeAccount) {
      this.isMicrosoftLoginLoading = true;
      this.loginEmployee();
      return;
    }

    this.isMicrosoftLoginLoading = true;
    this.msalService.loginPopup({
      prompt: 'select_account',
      scopes: this.loginScopes,
    }).subscribe({
      next: (response: AuthenticationResult) => {
        this.setActiveAccount(response.account);
        response.accessToken ? this.finishLogin(response.accessToken) : this.loginEmployee();
      },
      error: (error) => {
        if (error instanceof BrowserAuthError && error.errorCode === 'popup_window_error') {
          this.msalService.loginRedirect({
            prompt: 'select_account',
            scopes: this.loginScopes,
          });
          return;
        }
        this.handleMicrosoftLoginError(error);
      },
    });
  }

  private restoreActiveAccount(): void {
    const activeAccount = this.msalService.instance.getActiveAccount();
    if (activeAccount) {
      this.activeAccount = activeAccount;
      return;
    }

    const accounts = this.msalService.instance.getAllAccounts();
    this.activeAccount = accounts.length === 1 ? accounts[0] : null;
  }

  private setActiveAccount(account: AccountInfo): void {
    this.msalService.instance.setActiveAccount(account);
    this.activeAccount = account;
  }

  private loginEmployee(): void {
    if (!this.activeAccount) {
      this.isMicrosoftLoginLoading = false;
      return;
    }

    this.msalService.acquireTokenSilent({
      scopes: this.loginScopes,
      account: this.activeAccount,
    }).subscribe({
      next: (result: AuthenticationResult) => this.finishLogin(result.accessToken),
      error: (error) => {
        if (error instanceof InteractionRequiredAuthError) {
          this.msalService.acquireTokenPopup({
            scopes: this.loginScopes,
            account: this.activeAccount!,
          }).subscribe({
            next: (result: AuthenticationResult) => this.finishLogin(result.accessToken),
            error: (popupError) => this.handleMicrosoftLoginError(popupError),
          });
          return;
        }
        this.handleMicrosoftLoginError(error);
      },
    });
  }

  private finishLogin(accessToken: string): void {
    this.employeeService.employeeLoginWithMicrosoft(accessToken).subscribe({
      next: (response: login) => {
        this.isMicrosoftLoginLoading = false;
        if (!response.employeeData || !response.token) {
          this.toastr.error(this.loginFailureMessage(response.reason));
          return;
        }

        localStorage.setItem('employeeToken', response.token);
        this.notificationService.authSocketIo(response.token);
        this.notificationService.initializeNotifications();
        this.router.navigateByUrl(response.employeeData.preferences?.defaultLandingPage || '/home');
      },
      error: (error) => this.handleMicrosoftLoginError(error),
    });
  }

  private loginFailureMessage(reason: login['reason']): string {
    switch (reason) {
      case 'noEmail': return 'Your Microsoft account has no email address. Contact your administrator.';
      case 'ambiguousEmail': return 'More than one employee uses this email. Contact your administrator to link your account.';
      case 'blocked': return 'This employee account is blocked or deleted. Contact your administrator.';
      case 'linkedElsewhere': return 'This employee is already linked to a different Microsoft account. Contact your administrator.';
      default: return 'No matching employee account was found for this Microsoft login.';
    }
  }

  private handleMicrosoftLoginError(error: unknown): void {
    this.isMicrosoftLoginLoading = false;
    console.error('Microsoft login failed:', error);
    this.toastr.error('Microsoft login failed. Please try again.');
  }

  ngOnDestroy(): void {
    this.destroying$.next();
    this.destroying$.complete();
  }
}
