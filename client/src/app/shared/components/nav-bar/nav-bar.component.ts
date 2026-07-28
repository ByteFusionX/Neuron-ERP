import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Observable } from 'rxjs';
import { getEmployee } from '../../interfaces/employee.interface';
import { Router, RouterModule } from '@angular/router';
import { TextNotification } from '../../interfaces/notification.interface';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ButtonComponent } from '../button/button.component';
import { MsalService } from '@azure/msal-angular';

@Component({
    selector: 'app-nav-bar',
    templateUrl: './nav-bar.component.html',
    styleUrls: ['./nav-bar.component.css'],
    imports: [CommonModule,IconsModule, MatMenuModule, MatButtonModule,RouterModule,ButtonComponent]
})
export class NavBarComponent {
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
    private _notificationService: NotificationService,
    private msalService: MsalService
  ) { }

  ngOnInit() {
    this.textNotificationCount$ = this._notificationService.textNotificationsSubject$;
    this.getEmployeeData()
  }

  getEmployeeData() {
    this.employeeData$ = this._employeeService.employeeData$
    this.employeeData$.subscribe((emp) => {
      if(emp){
        this.showPortalMangement = Object.values(emp.category.privileges.portalManagement).some(value => value === true);
      }else{
        this._employeeService.getEmployeeData()
      }
    })
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
    localStorage.clear();
    sessionStorage.clear();
    this._router.navigate(['/login'])
  }

  onBellClick() {
    this.toggleDrawer.emit();
  }
}
