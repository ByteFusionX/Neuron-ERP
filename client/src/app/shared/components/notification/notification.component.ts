import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Component, Output, EventEmitter } from '@angular/core';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PushNotificationService } from 'src/app/core/services/push-notification.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TextNotification } from '../../interfaces/notification.interface';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { Observable, of, map, take, combineLatest } from 'rxjs';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { RouterModule } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-notification',
    templateUrl: './notification.component.html',
    styleUrls: ['./notification.component.css'],
    imports: [CommonModule, NgTemplateOutlet, IconsModule, RelativeTimePipe, RouterModule, MatTooltipModule],
    standalone:true
})
export class NotificationComponent {
  @Output() closeSidenav = new EventEmitter<void>();
  notifications$!: Observable<{ viewed: TextNotification[], unviewed: TextNotification[] }>;
  allNotifications$!: Observable<(TextNotification & { isUnread: boolean })[]>;
  unreadNotifications$!: Observable<(TextNotification & { isUnread: boolean })[]>;
  activeTab: 'all' | 'unread' = 'all';
  pushSubscribed$!: Observable<boolean>;
  pushSupported = false;
  pushToggleBusy = false;

  constructor(
    private _notificationService: NotificationService,
    private _pushNotificationService: PushNotificationService
  ) { }

  private sortByLatest<T extends { date?: Date }>(list: T[]): T[] {
    return [...(list || [])].sort((a, b) => {
      const aTime = a?.date ? new Date(a.date).getTime() : 0;
      const bTime = b?.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });
  }

  ngOnInit() {
    this.notifications$ = this._notificationService.textNotificationsSubject$.pipe(
      map(({ viewed, unviewed }) => ({
        viewed: this.sortByLatest(viewed),
        unviewed: this.sortByLatest(unviewed),
      }))
    );

    const merged$ = this.notifications$.pipe(
      map(({ viewed, unviewed }) => this.sortByLatest([
        ...unviewed.map(notification => ({ ...notification, isUnread: true })),
        ...viewed.map(notification => ({ ...notification, isUnread: false })),
      ]))
    );

    this.allNotifications$ = combineLatest([merged$, this._notificationService.markedUnreadIds$]).pipe(
      map(([all, markedUnreadIds]) => all.filter(notification => !notification._id || !markedUnreadIds.has(notification._id)))
    );

    this.unreadNotifications$ = combineLatest([merged$, this._notificationService.markedUnreadIds$]).pipe(
      map(([all, markedUnreadIds]) => all
        .filter(notification => notification._id && markedUnreadIds.has(notification._id))
        .map(notification => ({ ...notification, isUnread: true })))
    );

    this.pushSupported = this._pushNotificationService.isSupported;
    this.pushSubscribed$ = this._pushNotificationService.subscribed$;
    if (this.pushSupported) {
      this._pushNotificationService.refreshStatus();
    }
  }

  formatType(type: string): string {
    if (!type) {
      return '';
    }
    const spaced = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return spaced.replace(/\s+/g, ' ').trim().replace(/\b\w/g, char => char.toUpperCase());
  }

  isMarkedUnread(notificationId?: string): boolean {
    return this._notificationService.isMarkedUnread(notificationId);
  }

  onMarkAsUnread(notificationId?: string, event?: Event) {
    event?.stopPropagation();
    if (this.isMarkedUnread(notificationId)) {
      this._notificationService.clearMarkedUnread(notificationId);
      this.activeTab = 'all';
    } else {
      this._notificationService.markAsUnread(notificationId);
    }
  }

  onTogglePush() {
    if (this.pushToggleBusy) {
      return;
    }
    this.pushToggleBusy = true;
    this._pushNotificationService.toggle()
      .catch(error => console.error('Error toggling push notifications:', error))
      .finally(() => this.pushToggleBusy = false);
  }

  onClose() {
    this.closeSidenav.emit();
  }

  getIconName(type: string, solid = false): string {
    switch (type) {
      case 'Call':
        return solid ? 'heroPhoneSolid' : 'heroPhone';
      case 'Meeting':
        return solid ? 'heroUserGroupSolid' : 'heroUserGroup';
      case 'Send/Recieved Email':
        return solid ? 'heroEnvelopeSolid' : 'heroEnvelope';
      case 'Other':
        return solid ? 'heroEllipsisHorizontalCircleSolid' : 'heroEllipsisHorizontalCircle';
      default:
        return solid ? 'heroCalendarDaysSolid' : 'heroCalendarDays'; // default icon
    }
  }
  
  

  onMarkAsRead(notificationId?: string) {
    this._notificationService.clearMarkedUnread(notificationId);

    this._notificationService.textNotificationsSubject$.pipe(take(1)).subscribe(notifications => {
      const isUnviewed = notifications.unviewed?.some(notification => notification._id === notificationId);
      if (!isUnviewed) {
        return;
      }

      this._notificationService.markAsRead(notificationId).subscribe({
        next: () => {
          this._notificationService.textNotificationsSubject$.pipe(take(1)).subscribe(current => {
            const notificationToMove = current.unviewed.find(notification => notification._id === notificationId);

            if (notificationToMove) {
              const updatedUnviewed = current.unviewed.filter(notification => notification._id !== notificationId);
              const updatedViewed = [notificationToMove, ...current.viewed];
              this._notificationService.textNotificationsSubject.next({
                viewed: this.sortByLatest(updatedViewed) as TextNotification[],
                unviewed: this.sortByLatest(updatedUnviewed)
              });
            }
          });
        },
        error: (error) => {
          console.error('Error marking notification as read:', error);
        }
      });
    });
  }

  onNotificationClick(notification: TextNotification) {
    if (notification._id) {
      this.onMarkAsRead(notification._id);
    }
    this._notificationService.navigateToNotification(notification);
    this.closeSidenav.emit();
  }
}
