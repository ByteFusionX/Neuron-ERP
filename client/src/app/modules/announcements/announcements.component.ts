import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, ViewChildren, QueryList, Output, EventEmitter } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AddAnnouncementComponent } from './add-announcement/add-announcement.component';
import { AnnouncementService } from 'src/app/core/services/announcement/announcement.service';
import { Subject } from 'rxjs';
import { announcementGetData } from 'src/app/shared/interfaces/announcement.interface';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { NgIf, NgFor, NgTemplateOutlet, DatePipe } from '@angular/common';
import { SkeltonLoadingComponent } from 'src/app/shared/components/skelton-loading/skelton-loading.component';
import { ConfettiComponentComponent } from 'src/app/shared/components/confetti-component/confetti-component.component';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'app-announcements',
    templateUrl: './announcements.component.html',
    styleUrls: ['./announcements.component.css'],
    imports: [NgIf, SkeltonLoadingComponent, ConfettiComponentComponent, NgIcon, NgFor, NgTemplateOutlet, DatePipe]
})
export class AnnouncementsComponent implements OnDestroy, OnInit, AfterViewInit {
  @Output() closeSidenav = new EventEmitter<void>();
  createAnnouncement: boolean | undefined = false;
  deleteOrEditAnnouncement: boolean | undefined = false;
  private readonly destroy$ = new Subject<void>(); // Subject to manage component lifecycle
  announcementData: announcementGetData[] = [];
  recentData: announcementGetData | null = null; // Allow recentData to be null
  isLoading: boolean = true;
  isEmpty: boolean = false;
  total: number = 0;
  readonly page: number = 1;
  readonly row: number = 1000;
  userId!: string;
  userCategoryId!: string;

  @ViewChildren('announcementItem') announcementItems!: QueryList<ElementRef>;

  private notViewedIds: Set<string> = new Set(); // Track IDs of not viewed announcements

  constructor(
    public dialog: MatDialog,
    private _service: AnnouncementService,
    private toaster: ToastrService,
    private _employeeService: EmployeeService,
    private _notificationService: NotificationService,
  ) { }

  ngOnInit(): void {
    this.checkPermission();
    this.getAnnouncementData();
  }

  ngAfterViewInit() {
    this.announcementItems.changes.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.announcementItems.forEach(item => this.observeAnnouncement(item));
    });
  }

  openDialog() {
    const dialogRef = this.dialog.open(AddAnnouncementComponent);

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.getAnnouncementData();
      this.isEmpty = false;
    });
  }

  getAnnouncementData() {
    this._service.getAnnouncement(this.page, this.row,this.userCategoryId,this.userId).pipe(takeUntil(this.destroy$)).subscribe(
      (res: { total: number, announcements: announcementGetData[] }) => {
        if (res) {
          this.isLoading = false;
          this.announcementData = res.announcements;
          this.total = res.total;
          this.updateNotViewedIds();

          this.isEmpty = this.announcementData.length === 0;
          this.recentData = this.announcementData.shift() || null;
        } else {
          this.isLoading = false;
          this.isEmpty = true;
        }
      },
      () => {
        this.isLoading = false;
        this.isEmpty = true;
      }
    );
  }


  observeAnnouncement(element: ElementRef) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const announcementId = entry.target.getAttribute('data-id');
          if (announcementId && this.notViewedIds.has(announcementId)) {
            this.markAsViewed(announcementId);
            this.notViewedIds.delete(announcementId);
          }
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px', threshold: 1.0 });

    if (element?.nativeElement) {
      observer.observe(element.nativeElement);
    }
  }

  markAsViewed(announcementId: string | null) {
    if (announcementId && this.userId) {
      this._service.markAsViewed(announcementId, this.userId).pipe(takeUntil(this.destroy$)).subscribe()
    }
  }

  updateNotViewedIds() {
    this.notViewedIds.clear();
    if (this.recentData && !this.recentData.viewedBy.includes(this.userId)) {
      this.notViewedIds.add(this.recentData._id);
    }
    this.announcementData.forEach(announcement => {
      if (!announcement.viewedBy.includes(this.userId)) {
        this.notViewedIds.add(announcement._id);
      }
    });

  }

  editAnnouncement(data: announcementGetData) {
    const dialogRef = this.dialog.open(AddAnnouncementComponent, {
      data: { data }
    })

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.getAnnouncementData();
    })
  }

  deleteAnnouncement(data: announcementGetData) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Announcement',
        description: 'Are you sure you want to delete this announcement?',
        icon: 'heroTrash',
        IconColor: 'red'
      }
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((result) => {
      if (result) {
        this._service.deleteAnnouncement(data._id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.getAnnouncementData();
            this.toaster.success('Announcement deleted successfully');
          },
          error: () => {
            this.toaster.error('Failed to delete announcement');
          }
        });
      }
    });
  }

  trackByIdFn(index: number, item: announcementGetData): string {
    return item._id;
  }

  isMuted(item: announcementGetData): boolean {
    return !!item.date && new Date(item.date).getTime() < Date.now();
  }

  checkPermission() {
    this._employeeService.employeeData$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
      this.userId = data?._id || '';
      this.userCategoryId = data?.category._id || '';
      this.createAnnouncement = data?.category.privileges.announcement.create;
      this.deleteOrEditAnnouncement = data?.category.privileges.announcement.deleteOrEdit;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClose() {
    this.closeSidenav.emit();
  }
}
