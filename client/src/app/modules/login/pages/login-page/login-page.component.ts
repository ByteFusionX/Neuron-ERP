import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { login } from 'src/app/shared/interfaces/login';
import { NgIf } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AuthenticationResult, InteractionStatus, InteractionRequiredAuthError, BrowserAuthError } from '@azure/msal-browser';
import { filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';
import { environment } from 'src/environments/environment';

// employeeId/password login is disabled in favor of Azure AD login
// (see login-page.component.html: the password form block is commented out).
// To re-enable it: uncomment that block and onSubmit() below, and swap
// employee.router.ts's /login gate back to no auth.
@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.css'],
    imports: [NgIf, FormsModule, ReactiveFormsModule, NgIcon, appNoLeadingSpace]
})
export class LoginPageComponent implements OnDestroy {
  loginDisplay = false;
  activeAccount: any | null = null;
  isMicrosoftLoginLoading: boolean = false;

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
    private msalService: MsalService,
    private employeeService: EmployeeService,
    private msalBroadcastService: MsalBroadcastService,
    private notificationService: NotificationService,
    private toastr: ToastrService,
    private _fb: FormBuilder,
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

  passwordShow() {
    this.showPassword = !this.showPassword
    this.passwordType = this.showPassword ? 'text' : 'password';
    this.showIcon = this.showPassword ? 'heroEye' : 'heroEyeSlash';
  }

  // employeeId/password login is disabled in favor of Azure AD login.
  // Restore this (and the form block in login-page.component.html) to re-enable it.
  // onSubmit() {
  //   this.submit = true
  //   this.employeeNotFoundError = false
  //   this.passwordNotMatchError = false
  //   if (this.loginForm.valid) {
  //     this.isSaving = true;
  //     this.employeeService.employeeLogin(this.loginForm.value).subscribe({
  //       next: (res: login) => {
  //         if (res.employeeData && res.token) {
  //           localStorage.setItem('employeeToken', res.token)
  //           this.notificationService.authSocketIo(res.token)
  //           this.notificationService.initializeNotifications()
  //           this.router.navigate(['/home']);
  //         } else if (res.employeeNotFoundError) {
  //           this.isSaving = false;
  //           this.employeeNotFoundError = true;
  //         } else if (res.passwordNotMatchError) {
  //           this.isSaving = false;
  //           this.passwordNotMatchError = true
  //         }
  //       },
  //       error: () => {
  //         this.isSaving = false;
  //       }
  //     })
  //   }
  // }

  setLoginDisplay() {
    this.loginDisplay = this.msalService.instance.getAllAccounts().length > 0;
  }

  setActiveAccount() {
    const active = this.msalService.instance.getActiveAccount();
    if (active) {
      this.activeAccount = active;
      return;
    }
    // With more than one cached account we can't safely guess which one the
    // user wants, so leave activeAccount unset rather than picking [0] and
    // silently signing in as the wrong person on a shared machine.
    const accounts = this.msalService.instance.getAllAccounts();
    this.activeAccount = accounts.length === 1 ? accounts[0] : null;
  }

  private finishLogin(accessToken: string) {
    this.employeeService.employeeLoginWithMicrosoft(accessToken).subscribe({
      next: (res: login) => {
        this.isMicrosoftLoginLoading = false;
        if (res.employeeData && res.token) {
          localStorage.setItem('employeeToken', res.token)
          this.notificationService.authSocketIo(res.token)
          this.notificationService.initializeNotifications()
          this.router.navigate(['/home']);
        } else {
          this.toastr.error('No matching employee account was found for this Microsoft login.');
        }
      },
      error: () => {
        this.isMicrosoftLoginLoading = false;
        this.toastr.error('Microsoft login failed. Please try again.');
      }
    })
  }

  loginEmployee(){
    this.msalService.acquireTokenSilent({
      scopes: [environment.microsoftApiUrl],
    }).subscribe({
      next: (data: AuthenticationResult) => this.finishLogin(data.accessToken),
      error: (error: any) => {
        // A cached account with an expired/stale token (or one that now needs
        // fresh consent/MFA) can't be resolved silently — fall back to an
        // interactive popup instead of just failing.
        if (error instanceof InteractionRequiredAuthError) {
          this.msalService.acquireTokenPopup({
            scopes: [environment.microsoftApiUrl],
          }).subscribe({
            next: (data: AuthenticationResult) => this.finishLogin(data.accessToken),
            error: (popupError: any) => {
              this.isMicrosoftLoginLoading = false;
              console.error('Microsoft login failed:', popupError);
              this.toastr.error('Microsoft login failed. Please try again.');
            }
          });
          return;
        }
        this.isMicrosoftLoginLoading = false;
        console.error('Microsoft login failed:', error);
        this.toastr.error('Microsoft login failed. Please try again.');
      }
    })
  }

  loginWithMicrosoft(){
    this.setActiveAccount();
    if (!this.activeAccount) {
      localStorage.clear();
      sessionStorage.clear();
      this.isMicrosoftLoginLoading = true;
      this.msalService.loginPopup({
        prompt : 'select_account',
        scopes : ['user.read']
      }).subscribe({
        next: (response: AuthenticationResult) => {
          this.setLoginDisplay();
          this.msalService.instance.setActiveAccount(response.account);
          this.activeAccount = response.account;
          this.loginEmployee();
        },
        error: (error: any) => {
          this.isMicrosoftLoginLoading = false;
          console.error('Microsoft login failed:', error);
          // Popups can be blocked by corporate proxies/browser settings —
          // fall back to a full-page redirect rather than dead-ending.
          if (error instanceof BrowserAuthError && error.errorCode === 'popup_window_error') {
            this.msalService.loginRedirect({
              prompt: 'select_account',
              scopes: ['user.read']
            });
            return;
          }
          this.toastr.error('Microsoft login failed. Please try again.');
        }
      });
    } else {
      this.msalService.instance.setActiveAccount(this.activeAccount);
      this.isMicrosoftLoginLoading = true;
      this.loginEmployee();
    }
  }

  ngOnDestroy(): void {
    this._destroying$.next(undefined);
    this._destroying$.complete();
  }
}
