import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { celebCheckService } from './core/services/celebrationCheck/celebCheck.service';
import { announcementGetData } from './shared/interfaces/announcement.interface';
import { concatMap, from, takeUntil, Subscription, Observable } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CelebrationDialogComponent } from './shared/components/celebration-dialog/celebration-dialog.component';
import { Subject } from 'rxjs';
import { NotificationService } from './core/services/notification.service';
import { PushNotificationService } from './core/services/push-notification.service';
import { EmployeeService } from './core/services/employee/employee.service';
import { MatDrawer, MatDrawerContainer, MatDrawerContent } from '@angular/material/sidenav';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { NgIf } from '@angular/common';
import { SideBarComponent } from './shared/components/side-bar/side-bar.component';
import { NotificationComponent } from './shared/components/notification/notification.component';
import { AnnouncementsComponent } from './modules/announcements/announcements.component';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';
import { Idle, DEFAULT_INTERRUPTSOURCES } from '@ng-idle/core';
import { ToastrService } from 'ngx-toastr';
import { MsalService } from '@azure/msal-angular';
import { environment } from 'src/environments/environment';
import { ActionTrailService } from './core/diagnostics/action-trail.service';
import { LayoutService } from './core/services/layout.service';
import { CommandPaletteService } from './core/services/command-palette.service';
import { CommandPaletteComponent } from './shared/components/command-palette/command-palette.component';
import { clearSessionStorage } from './shared/utils/clear-session.util';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    imports: [LoadingBarModule, NgIf, RouterOutlet, SideBarComponent, MatDrawerContainer, MatDrawer, NotificationComponent, AnnouncementsComponent, MatDrawerContent, NavBarComponent, CommandPaletteComponent]
})
export class AppComponent implements OnDestroy, OnInit {
  showFiller = false;
  title = 'client';
  birthdaysViewed!: boolean;
  activePanel: 'notification' | 'announcement' = 'notification';
  loginRouter: boolean = false;
  dialogRef: MatDialogRef<CelebrationDialogComponent> | undefined;
  employeeToken: string | null = null;
  employee!: { id: string, employeeId: string };
  token: string | null = null;
  private celebrationCheckStarted = false;
  private destroy$ = new Subject<void>();
  private subscriptions: Subscription = new Subscription()

  @ViewChild('drawer') drawer!: MatDrawer;

  constructor(
    private route: ActivatedRoute,
    private _service: celebCheckService,
    private _notificationService: NotificationService,
    private _employeeService: EmployeeService,
    private dialog: MatDialog,
    private router: Router,
    private toaster: ToastrService,
    private authService: MsalService,
    private idle: Idle,
    private pushNotificationService: PushNotificationService,
    private actionTrailService: ActionTrailService,
    public layout: LayoutService,
    private palette: CommandPaletteService
  ) { }


  ngOnInit() {
    this.layout.init();

    this.idle.setIdle(14400); // 4 hours
    this.idle.setTimeout(5);
    this.idle.setInterrupts(DEFAULT_INTERRUPTSOURCES);
    this.idle.watch();


    this.idle.onTimeout.subscribe(() => {
      clearSessionStorage();
      this.router.navigate(['/login']);
    });

    // Azure AD login is temporarily disabled in favor of employeeId/password login.
    // Restore this MSAL-token block (and remove the employeeToken block below) to re-enable it.
    // const accounts = this.authService.instance.getAllAccounts();
    // if (accounts.length > 0) {
    //   if (!this.authService.instance.getActiveAccount()) {
    //     this.authService.instance.setActiveAccount(accounts[0]);
    //   }
    //
    //   const token = this.authService.acquireTokenSilent({
    //     scopes: [environment.microsoftApiUrl],
    //   });
    //
    //   token.subscribe((data) => {
    //     if (data) {
    //       this.token = data.accessToken
    //       this._notificationService.authSocketIo(data.accessToken)
    //       this._notificationService.getEmployeeTextNotifications()
    //       this._notificationService.initializeNotifications()
    //       if (!this.isLoginRoute()) {
    //         this.isUserThere();
    //       }
    //     }
    //   })
    // }

    const employeeToken = this._employeeService.getToken();
    if (employeeToken) {
      this.token = employeeToken;
      this._notificationService.authSocketIo(employeeToken)
      this._notificationService.getEmployeeTextNotifications()
      this._notificationService.initializeNotifications()
      this.pushNotificationService.registerAndSubscribe().catch(err => console.error('Push subscription failed:', err));
      if (!this.isLoginRoute()) {
        this.isUserThere();
      }
    }

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.loginRouter = this.isLoginRoute();
        if (!this.loginRouter) {
          this.layout.init();
          this.layout.closeOverlay();
          this.isUserThere();
          this._notificationService.markAsReadForRoute(event.urlAfterRedirects);
        }
      }
    });
  }

  getTimeAgo(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const interval = Math.floor(seconds / 31536000);

    if (interval > 1) return `${interval} years ago`;
    if (Math.floor(seconds / 2592000) > 1) return `${Math.floor(seconds / 2592000)} months ago`;
    if (Math.floor(seconds / 86400) > 1) return `${Math.floor(seconds / 86400)} days ago`;
    if (Math.floor(seconds / 3600) > 1) return `${Math.floor(seconds / 3600)} hours ago`;
    if (Math.floor(seconds / 60) > 1) return `${Math.floor(seconds / 60)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.layout.onViewportChange(window.innerWidth);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'k') return;
    if (this.isLoginRoute()) return;
    if (key === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable) return;
    event.preventDefault();
    this.layout.toggleHidden();
  }

  onResizeHandlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.layout.startDrag();
  }

  onResizeHandlePointerMove(event: PointerEvent): void {
    if (this.layout.dragging()) this.layout.dragTo(event.clientX);
  }

  onResizeHandlePointerUp(event: PointerEvent): void {
    if (!this.layout.dragging()) return;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    this.layout.endDrag();
  }

  onResizeHandleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') this.layout.nudge(1);
    else if (event.key === 'ArrowLeft') this.layout.nudge(-1);
    else if (event.key === 'Home') this.layout.reset();
    else return;
    event.preventDefault();
  }

  isLoginRoute(): boolean {
    // Azure AD login is temporarily disabled; check employeeToken instead of MSAL accounts.
    // const accounts = this.authService.instance.getAllAccounts();
    // const isAuthenticated = accounts.length > 0;
    const isAuthenticated = !!this._employeeService.getToken();
    const bareShellPaths = ['login', 'zxing-scan'];
    return !isAuthenticated || bareShellPaths.includes(this.route.snapshot.firstChild?.routeConfig?.path ?? '');
  }

  isUserThere() {
    this.getCelebData()
  }
  
  getCelebData() {
    if (this.token && !this.celebrationCheckStarted) {
      this.birthdaysViewed = this._service.hasTodaysBirthdaysBeenViewed();
      if (!this.birthdaysViewed) {
        this.celebrationCheckStarted = true;
        this.subscriptions.add(
          this._service.getCelebrationData().subscribe({
            next: (data) => {
              if (data && data.length > 0) {
                const uniqueCelebrations = Array.from(
                  new Map(data.map(item => [item.title, item])).values()
                );
                from(uniqueCelebrations).pipe(
                  concatMap(item => {
                    this.dialogRef = this.openCelebrationDialog(item);
                    return this.dialogRef.afterClosed();
                  }),
                  takeUntil(this.destroy$)
                ).subscribe();
                this._service.markTodaysBirthdaysAsViewed();
              }
            },
            error: (error) => {
              console.error('Error fetching celebration data:', error);
              this.celebrationCheckStarted = false;
            }
          })
        )
      }
    }
  }

  openCelebrationDialog(data: announcementGetData): MatDialogRef<CelebrationDialogComponent> {
    return this.dialog.open(CelebrationDialogComponent, {
      data: data,
      width: '400px',
    });
  }

  closeSidenav() {
    if (this.drawer) {
      this.drawer.close();
    }
  }

  openPanel(panel: 'notification' | 'announcement') {
    if (this.drawer && this.drawer.opened && this.activePanel === panel) {
      this.drawer.close();
      return;
    }
    this.activePanel = panel;
    this.drawer?.open();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe()
  }
}
