import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { AppRoutingModule } from 'src/app/app-routing.module';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Observable } from 'rxjs';
import { getEmployee } from '../../interfaces/employee.interface';
import { Router } from '@angular/router';
import { NotificationCounts, TextNotification } from '../../interfaces/notification.interface';
import { NotificationService } from 'src/app/core/services/notification.service';

@Component({
    selector: 'app-nav-bar',
    templateUrl: './nav-bar.component.html',
    styleUrls: ['./nav-bar.component.css'],
    imports: [CommonModule, AppRoutingModule, IconsModule, MatMenuModule, MatButtonModule]
})
export class NavBarComponent {
  notificationCounts$!: Observable<NotificationCounts>;
  textNotificationCount$!: Observable<{viewed:TextNotification[],unviewed:TextNotification[]}>;
  @Output() reduce = new EventEmitter<boolean>()
  showFullBar: boolean = true
  menuState: boolean = false
  showPortalMangement: boolean = false;
  employee!: { id: string, employeeId: string };
  employeeData$!: Observable<getEmployee | undefined>
  @Output() toggleDrawer = new EventEmitter<void>();

  constructor(
    private _employeeService: EmployeeService,
    private _router: Router,
    private _notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.notificationCounts$ = this._notificationService.notificationCounts$;
    this.textNotificationCount$ = this._notificationService.textNotificationsSubject$;
    this.employee = this._employeeService.employeeToken()
    if (this.employee) {
      const employeeId = this.employee.employeeId
      this._employeeService.getEmployeeData(employeeId)
      this.employeeData$ = this._employeeService.employeeData$

      this.employeeData$.subscribe((emp) => {

        if(emp){
          this.showPortalMangement = Object.values(emp.category.privileges.portalManagement).some(value => value === true);
        }
      })
    }
  }

  reduceSideBar() {
    this.showFullBar = !this.showFullBar
    this.reduce.emit(this.showFullBar)
  }

  onFeedbacks() {
    this._router.navigate(['/feedback-requests'])
  }

  menuOpened() {
    this.menuState = !this.menuState
  }

  menuClosed() {
    this.menuState = !this.menuState
  }

  signOut() {
    localStorage.removeItem('employeeToken')
    this._router.navigate(['/login'])
  }

  onBellClick() {
    this.toggleDrawer.emit();
  }
}
