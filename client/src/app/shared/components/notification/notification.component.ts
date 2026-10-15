import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Observable, combineLatest, map, take } from 'rxjs';

import { NotificationService } from 'src/app/core/services/notification.service';
import { PushNotificationService } from 'src/app/core/services/push-notification.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { TextNotification } from '../../interfaces/notification.interface';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { ActionMenuComponent, ActionMenuItem } from '../action-menu/action-menu.component';
import { DetailAvatarComponent } from '../detail-panel/detail-avatar.component';
import { DetailBadgeComponent } from '../detail-panel/detail-badge.component';
import { DetailFilterChipsComponent } from '../detail-panel/detail-filter-chips.component';
import { DetailIconButtonComponent } from '../detail-panel/detail-icon-button.component';
import { DetailTone, toneClasses } from '../detail-panel/detail-tone';

type PanelItem = TextNotification & { isUnread: boolean };

interface PanelSection {
  label: string;
  items: PanelItem[];
}

interface TypeMeta {
  icon: string;
  /** Colour of the small type badge on the avatar */
  tone: DetailTone;
}

/** Types that ask the reader to do something; unread ones are pinned under "Needs action". */
const ACTION_TYPES = new Set([
  'AssignedJob', 'ReAssignedJob', 'FeedbackRequest', 'DealSheet', 'TechnicalAssigned', 'MrApprovalRequest',
  'PurchaseApprovalRequest', 'PurchaseRequestAllocated', 'JobAllocated', 'LpoApprovalRequest',
  'SupplierApprovalRequest', 'ClaimApprovalRequest', 'BugReportAssigned', 'EnquiryFollowUpOverdue', 'RfqFollowUpOverdue',
]);

/**
 * Quick-look notification inbox, shown in a CDK overlay under the bell in the nav bar.
 * Unread action items are pinned at the top; the rest is grouped into Today / Earlier.
 */
@Component({
  selector: 'app-notification',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.css'],
  imports: [
    CommonModule, IconsModule, RelativeTimePipe, ActionMenuComponent, DetailAvatarComponent, DetailBadgeComponent,
    DetailFilterChipsComponent, DetailIconButtonComponent,
  ],
})
export class NotificationComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  readonly tabs = ['All', 'Unread'];
  readonly warnText = toneClasses('warn').text;
  activeTab: 'All' | 'Unread' = 'All';
  sections$!: Observable<{ all: PanelSection[]; unread: PanelSection[]; unreadCount: number }>;
  pushSubscribed$!: Observable<boolean>;
  pushSupported = false;
  pushToggleBusy = false;

  constructor(
    private _notificationService: NotificationService,
    private _pushNotificationService: PushNotificationService,
  ) {}

  ngOnInit(): void {
    this.sections$ = combineLatest([
      this._notificationService.textNotificationsSubject$,
      this._notificationService.markedUnreadIds$,
    ]).pipe(
      map(([{ viewed, unviewed }, marked]) => {
        const items: PanelItem[] = [
          ...(unviewed || []).map((n) => ({ ...n, isUnread: true })),
          ...(viewed || []).map((n) => ({ ...n, isUnread: !!n._id && marked.has(n._id) })),
        ].sort((a, b) => this.time(b) - this.time(a));
        const unread = items.filter((n) => n.isUnread);
        return { all: this.group(items), unread: this.group(unread), unreadCount: unread.length };
      }),
    );

    this.pushSupported = this._pushNotificationService.isSupported;
    this.pushSubscribed$ = this._pushNotificationService.subscribed$;
    if (this.pushSupported) this._pushNotificationService.refreshStatus();
  }

  trackById(_: number, item: PanelItem): string | undefined {
    return item._id;
  }

  /** Sender name, or a readable type name for system notifications. */
  actor(item: TextNotification): string {
    const s = item.sentBy;
    if (s?.firstName) return `${s.firstName} ${s.lastName || ''}`.trim();
    return this.formatType(item.type);
  }

  initials(item: TextNotification): string {
    const s = item.sentBy;
    if (!s?.firstName) return '';
    return `${s.firstName[0] || ''}${s.lastName?.[0] || ''}`.toUpperCase();
  }

  /** Event notifications carry the event date on the referenced document. */
  eventDate(item: TextNotification): string | null {
    return item.type === 'Event' ? item.referenceId?.date || null : null;
  }

  // additionalData.enquiryId is the Mongo _id (used for routing); only show it as a chip when it is a readable reference
  readableEnquiryId(item: TextNotification): string | null {
    const id = item.additionalData?.enquiryId;
    return typeof id === 'string' && id && !/^[0-9a-f]{24}$/i.test(id) ? id : null;
  }

  meta(type: string): TypeMeta {
    if (type === 'Announcement') return { icon: 'heroMegaphone', tone: 'active' };
    if (type === 'Event') return { icon: 'heroCalendarDays', tone: 'info' };
    if (type?.startsWith('BugReport')) return { icon: 'heroExclamationTriangle', tone: 'bad' };
    if (type?.startsWith('Claim')) return { icon: 'heroBanknotes', tone: 'good' };
    if (type?.startsWith('Supplier')) return { icon: 'heroTruck', tone: 'warn' };
    if (type?.startsWith('Lpo') || type?.startsWith('Purchase') || type === 'JobAllocated' || type === 'ProcurementTransferred')
      return { icon: 'heroShoppingCart', tone: 'warn' };
    if (type?.startsWith('Mr') || type?.startsWith('Technical')) return { icon: 'heroWrenchScrewdriver', tone: 'neutral' };
    if (type?.includes('Job') || type === 'FeedbackRequest') return { icon: 'heroBriefcase', tone: 'active' };
    if (type?.startsWith('Quotation') || type?.startsWith('DealSheet')) return { icon: 'heroDocumentText', tone: 'good' };
    if (type?.startsWith('Enquiry') || type?.startsWith('Rfq')) return { icon: 'heroEnvelope', tone: 'info' };
    return { icon: 'heroBellAlert', tone: 'neutral' };
  }

  formatType(type: string): string {
    if (!type) return '';
    return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  }

  dotClass(tone: DetailTone): string {
    return toneClasses(tone).dot;
  }

  menuItems(unreadCount: number, pushOn: boolean): ActionMenuItem[] {
    const items: ActionMenuItem[] = [{ id: 'markAll', label: 'Mark all as read', icon: 'heroCheckCircle', disabled: !unreadCount }];
    if (this.pushSupported) {
      items.push({ id: 'push', label: pushOn ? 'Turn off desktop alerts' : 'Turn on desktop alerts', icon: pushOn ? 'heroBell' : 'heroBellAlert', disabled: this.pushToggleBusy });
    }
    return items;
  }

  onMenu(id: string): void {
    if (id === 'markAll') this.markAllRead();
    else if (id === 'push') this.onTogglePush();
  }

  open(item: PanelItem): void {
    if (item._id) this.markRead(item);
    this._notificationService.navigateToNotification(item);
    this.closed.emit();
  }

  toggleRead(item: PanelItem, event: Event): void {
    event.stopPropagation();
    if (item.isUnread) this.markRead(item);
    else this._notificationService.markAsUnread(item._id);
  }

  dismiss(item: PanelItem, event: Event): void {
    event.stopPropagation();
    if (!item._id) return;
    this._notificationService.dismiss(item._id).subscribe({
      error: (error) => console.error('Error dismissing notification:', error),
    });
  }

  markAllRead(): void {
    this._notificationService.markAllAsRead().subscribe({
      error: (error) => console.error('Error marking all notifications as read:', error),
    });
  }

  onTogglePush(): void {
    if (this.pushToggleBusy) return;
    this.pushToggleBusy = true;
    this._pushNotificationService.toggle()
      .catch((error) => console.error('Error toggling push notifications:', error))
      .finally(() => (this.pushToggleBusy = false));
  }

  private markRead(item: PanelItem): void {
    const id = item._id;
    this._notificationService.clearMarkedUnread(id);
    this._notificationService.textNotificationsSubject$.pipe(take(1)).subscribe((current) => {
      const target = current.unviewed.find((n) => n._id === id);
      if (!target) return;
      // Move it locally first so the dot and badge clear straight away
      this._notificationService.textNotificationsSubject.next({
        viewed: [target, ...current.viewed],
        unviewed: current.unviewed.filter((n) => n._id !== id),
      });
      this._notificationService.markAsRead(id).subscribe({
        error: (error) => console.error('Error marking notification as read:', error),
      });
    });
  }

  private group(items: PanelItem[]): PanelSection[] {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const action = items.filter((n) => n.isUnread && ACTION_TYPES.has(n.type));
    const rest = items.filter((n) => !action.includes(n));
    return [
      { label: 'Needs action', items: action },
      { label: 'Today', items: rest.filter((n) => this.time(n) >= startOfToday) },
      { label: 'Earlier', items: rest.filter((n) => this.time(n) < startOfToday) },
    ].filter((s) => s.items.length);
  }

  private time(n: TextNotification): number {
    return n?.date ? new Date(n.date).getTime() : 0;
  }
}
