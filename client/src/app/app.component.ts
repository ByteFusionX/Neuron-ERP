import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { celebCheckService } from './core/services/celebrationCheck/celebCheck.service';
import { announcementGetData } from './shared/interfaces/announcement.interface';
import { concatMap, from, interval, take, switchMap, takeUntil, Subscription, Observable } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CelebrationDialogComponent } from './shared/components/celebration-dialog/celebration-dialog.component';
import { Subject } from 'rxjs';
import { NotificationService } from './core/services/notification.service';
import { EmployeeService } from './core/services/employee/employee.service';
import { MatDrawer, MatDrawerContainer, MatDrawerContent } from '@angular/material/sidenav';
import { LoadingBarModule } from '@ngx-loading-bar/core';
import { NgIf } from '@angular/common';
import { SideBarComponent } from './shared/components/side-bar/side-bar.component';
import { NotificationComponent } from './shared/components/notification/notification.component';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';
import { Idle, DEFAULT_INTERRUPTSOURCES } from '@ng-idle/core';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    imports: [LoadingBarModule, NgIf, RouterOutlet, SideBarComponent, MatDrawerContainer, MatDrawer, NotificationComponent, MatDrawerContent, NavBarComponent]
})
export class AppComponent implements OnDestroy, OnInit {
  showFiller = false;
  title = 'client';
  birthdaysViewed!: boolean;
  reduceState: boolean = true;
  loginRouter: boolean = false;
  dialogRef: MatDialogRef<CelebrationDialogComponent> | undefined;
  employeeToken: string | null = null;
  employee!: { id: string, employeeId: string };

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
    private idle: Idle
  ) { }


  ngOnInit() {
    this.idle.setIdle(14400); // 4 hours
    this.idle.setTimeout(5);
    this.idle.setInterrupts(DEFAULT_INTERRUPTSOURCES);
    this.idle.watch();


    this.idle.onTimeout.subscribe(() => {
      this.toaster.error('Session expired. Please login again.', 'Session Expired', {
        timeOut: 0,
        extendedTimeOut: 0,
        closeButton: true,
        tapToDismiss: true
      });
      localStorage.removeItem('employeeToken');
      this.router.navigate(['/login']);
    });

    const token = this._employeeService.getToken() as string;;
    if (token) {
      this._notificationService.authSocketIo(token)
      this._notificationService.getEmployeeNotifications(token)
      this._notificationService.getEmployeeTextNotifications(token)
      this._notificationService.initializeNotifications()
    }

    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.loginRouter = this.isLoginRoute();
        if (!this.loginRouter) {
          this.isUserThere();
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

  reduceSideBar(event: boolean) {
    this.reduceState = event;
  }

  isLoginRoute(): boolean {
    const employeeToken = localStorage.getItem('employeeToken');
    return (employeeToken === null || employeeToken === undefined) || this.route.snapshot.firstChild?.routeConfig?.path === 'login';
  }

  isUserThere() {
    this.employeeToken = localStorage.getItem('employeeToken');
    this.getCelebData()
  }
  

  getCelebData() {
    if (this.employeeToken) {
      this.birthdaysViewed = this._service.hasTodaysBirthdaysBeenViewed();
      if (!this.birthdaysViewed) {
        this.subscriptions.add(
          this._service.getCelebrationData().subscribe((data) => {
            if (data && data.length > 0) {
              from(data).pipe(
                concatMap((item, index) => {
                  return interval(1000 * index).pipe(
                    take(1),
                    switchMap(() => {
                      if (this.dialogRef && this.dialogRef.componentInstance) {
                        return this.dialogRef.afterClosed().pipe(
                          takeUntil(this.destroy$),
                          switchMap(() => {
                            this.dialogRef = this.openCelebrationDialog(item);
                            return [];
                          })
                        );
                      } else {
                        this.dialogRef = this.openCelebrationDialog(item);
                        return [];
                      }
                    })
                  );
                }),
                takeUntil(this.destroy$)
              ).subscribe();
            }
          })
        )
      }
      this._service.markTodaysBirthdaysAsViewed();
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

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe()
  }

}
