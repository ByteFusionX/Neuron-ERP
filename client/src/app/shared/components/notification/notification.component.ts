import { CommonModule } from '@angular/common';
import { Component, Output, EventEmitter } from '@angular/core';
import { NotificationService } from 'src/app/core/services/notification.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TextNotification } from '../../interfaces/notification.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Observable, of } from 'rxjs';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-notification',
    templateUrl: './notification.component.html',
    styleUrls: ['./notification.component.css'],
    imports: [CommonModule, IconsModule, RelativeTimePipe, RouterModule],
    standalone:true
})
export class NotificationComponent {
  @Output() closeSidenav = new EventEmitter<void>();
  notifications$!: Observable<{ viewed: TextNotification[], unviewed: TextNotification[] }>;
  activeTab: 'unread' | 'read' = 'unread';

  constructor(
    private _notificationService: NotificationService
  ) { }

  ngOnInit() {
    this.notifications$ = this._notificationService.textNotificationsSubject$
  }

  onClose() {
    this.closeSidenav.emit();
  }

  getIconName(type: string): string {
    switch (type) {
      case 'Call':
        return 'heroPhone';
      case 'Meeting':
        return 'heroUserGroup';
      case 'Send/Recieved Email':
        return 'heroEnvelope';
      case 'Other':
        return 'heroEllipsisHorizontalCircle';
      default:
        return 'heroCalendarDays'; // default icon
    }
  }
  
  

  onMarkAsRead(notificationId?: string) {
    this._notificationService.markAsRead(notificationId).subscribe({
      next: () => {
        this.notifications$.subscribe(notifications => {
          if (notifications.unviewed) {
            const notificationToMove = notifications.unviewed.find(notification => notification._id === notificationId);

            if (notificationToMove) {
              const updatedUnviewed = notifications.unviewed.filter(notification => notification._id !== notificationId);
              const updatedViewed = [...notifications.viewed, notificationToMove];
              this._notificationService.textNotificationsSubject.next({
                viewed: updatedViewed as TextNotification[],
                unviewed: updatedUnviewed
              });
            }
          }
        });

      },
      error: (error) => {
        console.error('Error marking notification as read:', error);
      }
    });
  }
}
