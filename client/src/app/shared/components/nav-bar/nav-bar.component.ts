import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild, effect } from '@angular/core';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { ReportBugComponent } from '../report-bug/report-bug.component';
import { BugReportScreenshotService } from 'src/app/core/diagnostics/bug-report-screenshot.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { combineLatest, Observable, map } from 'rxjs';
import { getEmployee } from '../../interfaces/employee.interface';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { TextNotification } from '../../interfaces/notification.interface';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ButtonComponent } from '../button/button.component';
import { MsalService } from '@azure/msal-angular';
import { LayoutService } from 'src/app/core/services/layout.service';
import { clearSessionStorage } from '../../utils/clear-session.util';
import { CountBadgeComponent } from '../count-badge/count-badge.component';
import { ThemeService } from 'src/app/core/services/theme.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommandPaletteService } from 'src/app/core/services/command-palette.service';
import { Crumb, buildBreadcrumbs } from '../../constants/nav-menu';

@Component({
    selector: 'app-nav-bar',
    templateUrl: './nav-bar.component.html',
    styleUrls: ['./nav-bar.component.css'],
    imports: [CommonModule,IconsModule, MatMenuModule, MatButtonModule,RouterModule,ButtonComponent,MatTooltipModule,CountBadgeComponent]
})
export class NavBarComponent {
  breadcrumbs: Crumb[] = [];
  textNotificationCount$!: Observable<{viewed:TextNotification[],unviewed:TextNotification[]}>;
  textNotificationBadgeCount$!: Observable<number>;
  announcementNotificationCount$!: Observable<number>;
  menuState: boolean = false
  showPortalMangement: boolean = false;
  isSuperAdmin: boolean = false;
  employee!: { id: string, employeeId: string };
  employeeData$!: Observable<getEmployee | undefined>
  @Output() toggleDrawer = new EventEmitter<void>();
  @Output() toggleAnnouncementDrawer = new EventEmitter<void>();
  @ViewChild(MatMenuTrigger) menuTrigger?: MatMenuTrigger;

  constructor(
    private _employeeService: EmployeeService,
    private _router: Router,
    private _notificationService: NotificationService,
    private msalService: MsalService,
    private dialog: MatDialog,
    private bugReportScreenshotService: BugReportScreenshotService,
    public layout: LayoutService,
    public themeService: ThemeService,
    public palette: CommandPaletteService
  ) {
    // An open profile menu holds a scroll-blocking overlay that keeps the palette's list from scrolling (Ctrl+K).
    effect(() => {
      if (this.palette.isOpen()) this.menuTrigger?.closeMenu();
    });
    this.breadcrumbs = buildBreadcrumbs(this._router.url);
    this._router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.breadcrumbs = buildBreadcrumbs(event.urlAfterRedirects);
    });
  }

  ngOnInit() {
    this.textNotificationCount$ = this._notificationService.textNotificationsSubject$;
    this.announcementNotificationCount$ = this.textNotificationCount$.pipe(
      map((notifications) => notifications.unviewed.filter((n) => n.type === 'Announcement').length)
    );
    this.textNotificationBadgeCount$ = combineLatest([
      this.textNotificationCount$,
      this._notificationService.markedUnreadIds$,
    ]).pipe(
      map(([{ viewed, unviewed }, markedUnreadIds]) => {
        const reMarkedUnread = (viewed || []).filter(
          (notification) => notification._id && markedUnreadIds.has(notification._id)
        ).length;
        return unviewed.length + reMarkedUnread;
      })
    );
    this.getEmployeeData()
  }

  getEmployeeData() {
    this.employeeData$ = this._employeeService.employeeData$
    this.employeeData$.subscribe((emp) => {
      if(emp){
        this.showPortalMangement = Object.values(emp.category.privileges.portalManagement).some(value => value === true);
        this.isSuperAdmin = emp.category.role === 'superAdmin';
      }else{
        this._employeeService.getEmployeeData()
      }
    })
  }
  
  get sidebarToggleLabel(): string {
    if (this.layout.isMobile()) return 'Open menu';
    if (this.layout.hidden()) return 'Show sidebar (Ctrl+B)';
    return this.layout.showFullBar() ? 'Collapse sidebar' : 'Expand sidebar';
  }

  toggleSidebar() {
    this.layout.toggleFromNavbar();
  }

  menuOpened() {
    this.menuState = !this.menuState
  }

  menuClosed() {
    this.menuState = !this.menuState
  }

  signOut() {
    const account = this.msalService.instance.getActiveAccount() ?? this.msalService.instance.getAllAccounts()[0];
    clearSessionStorage();
    this._employeeService.employeeSubject.next(undefined);
    this._router.navigate(['/login'])
    if (account) {
      // Clear the Azure session too, otherwise "Continue with Microsoft" on the
      // login page silently signs the same account back in without a prompt.
      this.msalService.instance.setActiveAccount(null);
      this.msalService.logoutPopup({ account }).subscribe({ error: () => {} });
    }
  }

  onBellClick() {
    this.toggleDrawer.emit();
  }

  onAnnouncementsClick() {
    this.toggleAnnouncementDrawer.emit();
  }

  setTheme(theme: 'light' | 'dark') {
    this.themeService.setTheme(theme);
  }

  onReportBug() {
    this.bugReportScreenshotService.clear();
    this.dialog.open(ReportBugComponent, {
      disableClose: true,
      maxHeight: '90vh',
      width: '600px',
    });
  }
}
