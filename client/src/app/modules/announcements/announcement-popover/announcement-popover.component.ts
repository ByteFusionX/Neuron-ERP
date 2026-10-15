import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AnnouncementService } from 'src/app/core/services/announcement/announcement.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { RelativeTimePipe } from 'src/app/shared/pipes/relative-time.pipe';
import { announcementGetData } from 'src/app/shared/interfaces/announcement.interface';
import { PRIORITY_ACCENT, priorityOf, publishDateOf, typeOf } from '../announcement-meta';

const PEEK_SIZE = 6;

/** Quick look from the top bar: latest announcements (pinned and urgent first) and a link to the full page. */
@Component({
  selector: 'app-announcement-popover',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, IconsModule, RelativeTimePipe],
  template: `
    <div class="flex max-h-[min(560px,calc(100vh-5rem))] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-erp-border bg-erp-surface shadow-xl dark:border-erp-border-dark dark:bg-erp-surface-dark"
      role="dialog" aria-label="Announcements">
      <header class="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-erp-border-dark">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Announcements</h2>
        <span *ngIf="announcements.unread() > 0" class="rounded-full bg-violet-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{{ announcements.unread() }} new</span>
        <button *ngIf="announcements.unread() > 0" type="button" (click)="markAllRead()"
          class="ml-auto text-xs font-medium text-violet-700 hover:underline dark:text-violet-300">Mark all read</button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div *ngIf="isLoading" class="space-y-3 p-4">
          <div *ngFor="let n of [1, 2, 3]" class="animate-pulse">
            <div class="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
            <div class="mt-2 h-3 w-full rounded bg-gray-100 dark:bg-gray-800"></div>
          </div>
        </div>

        <div *ngIf="!isLoading && items.length === 0" class="px-6 py-10 text-center">
          <ng-icon name="heroInbox" class="text-2xl text-gray-300"></ng-icon>
          <p class="mt-2 text-xs text-gray-500">No announcements right now.</p>
        </div>

        <button *ngFor="let item of items" type="button" (click)="open(item)"
          class="block w-full border-b border-l-4 border-b-gray-100 px-4 py-3 text-left transition hover:bg-gray-50 dark:border-b-erp-border-dark dark:hover:bg-gray-800/60"
          [ngClass]="priorityAccent[item.priority || 'normal']">
          <div class="flex items-center gap-2">
            <span *ngIf="!item.isRead" class="h-2 w-2 shrink-0 rounded-full bg-violet-600" aria-label="Unread"></span>
            <ng-icon [name]="typeOf(item).icon" class="shrink-0 text-sm text-gray-400"></ng-icon>
            <span class="line-clamp-1 flex-1 text-[13px] text-gray-900 dark:text-gray-100" [class.font-semibold]="!item.isRead">{{ item.title }}</span>
            <ng-icon *ngIf="item.pinned" name="heroBookmark" class="shrink-0 text-xs text-violet-500" aria-label="Pinned"></ng-icon>
          </div>
          <p class="mt-0.5 line-clamp-2 pl-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{{ item.description }}</p>
          <div class="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
            <span>{{ publishDateOf(item) | relativeTime }}</span>
            <span *ngIf="item.priority && item.priority !== 'normal'" class="rounded-full px-1.5 font-medium" [ngClass]="priorityOf(item).chip">{{ priorityOf(item).label }}</span>
            <span *ngIf="item.requireAck && !item.isAcknowledged" class="ml-auto font-medium text-amber-600 dark:text-amber-400">Needs acknowledgement</span>
          </div>
        </button>
      </div>

      <footer class="border-t border-gray-100 p-2 dark:border-erp-border-dark">
        <button type="button" (click)="viewAll()"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40">
          View all announcements <ng-icon name="heroArrowRight" class="text-xs"></ng-icon>
        </button>
      </footer>
    </div>
  `,
})
export class AnnouncementPopoverComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  readonly priorityAccent = PRIORITY_ACCENT;
  readonly priorityOf = priorityOf;
  readonly typeOf = typeOf;
  readonly publishDateOf = publishDateOf;

  items: announcementGetData[] = [];
  isLoading = true;

  private readonly destroy$ = new Subject<void>();

  constructor(public announcements: AnnouncementService, private router: Router) {}

  ngOnInit(): void {
    this.announcements.getAnnouncement({ page: 1, row: PEEK_SIZE }, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.items = res.announcements;
        this.isLoading = false;
      },
      error: () => (this.isLoading = false),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  open(item: announcementGetData): void {
    this.closed.emit();
    this.router.navigate(['/announcements'], { queryParams: { id: item._id } });
  }

  viewAll(): void {
    this.closed.emit();
    this.router.navigate(['/announcements']);
  }

  markAllRead(): void {
    this.announcements.markAllAsViewed().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.items.forEach((item) => (item.isRead = true)),
      error: () => {},
    });
  }
}
