import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

import { AnnouncementService } from 'src/app/core/services/announcement/announcement.service';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { SfOption } from 'src/app/shared/components/smart-form/sf.model';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import {
  announcementGetData,
  announcementPostData,
  AnnouncementPriority,
  AnnouncementType,
} from 'src/app/shared/interfaces/announcement.interface';
import { GetCategory } from 'src/app/shared/interfaces/employee.interface';
import { PRIORITY_OPTIONS, TYPE_OPTIONS } from '../announcement-meta';

const TITLE_MAX = 150;
const MESSAGE_MAX = 5000;

/** 'yyyy-MM-ddTHH:mm' in local time, for <input type="datetime-local">. */
const toLocalInput = (value: Date | string): string => {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toDateInput = (value: Date | string): string => toLocalInput(value).slice(0, 10);

const futureDateTime = (control: AbstractControl): ValidationErrors | null =>
  control.value && new Date(control.value).getTime() <= Date.now() ? { past: true } : null;

/**
 * Create / edit announcement slide-over. The host binds `open` and reacts to `saved` / `closed`;
 * passing `announcement` switches it to edit mode.
 */
@Component({
  selector: 'app-add-announcement',
  templateUrl: './add-announcement.component.html',
  styleUrls: ['./add-announcement.component.css'],
  imports: [CommonModule, IconsModule, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
})
export class AddAnnouncementComponent implements OnInit, OnChanges, OnDestroy {
  @Input() open = false;
  /** The announcement being edited; leave null to create one. */
  @Input() announcement: announcementGetData | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  readonly titleMax = TITLE_MAX;
  readonly messageMax = MESSAGE_MAX;
  readonly priorityOptions = PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly typeOptions = TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly publishOptions = [{ value: 'now', label: 'Publish now' }, { value: 'schedule', label: 'Schedule' }];
  readonly audienceModeOptions = [{ value: 'all', label: 'Everyone' }, { value: 'specific', label: 'Specific categories' }];
  audienceOptions: SfOption[] = [];
    minDateTime = toLocalInput(new Date());

  categories: GetCategory[] = [];
  submitted = false;
  saving: 'published' | 'draft' | null = null;

  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    description: ['', [Validators.required, Validators.maxLength(MESSAGE_MAX)]],
    type: ['general' as AnnouncementType],
    priority: ['normal' as AnnouncementPriority],
    audienceMode: ['all' as 'all' | 'specific'],
    category: [[] as string[]],
    publishMode: ['now' as 'now' | 'schedule'],
    publishAt: [''],
    expiresAt: [''],
    link: ['', Validators.pattern(/^https?:\/\/\S+$/i)],
    pinned: [false],
    requireAck: [false],
  }, { validators: (group) => this.expiryAfterPublish(group) });

  constructor(
    private service: AnnouncementService,
    private toastr: ToastrService,
    private employeeService: EmployeeService,
  ) {}

  ngOnInit(): void {
    this.employeeService.getCategory().pipe(takeUntil(this.destroy$)).subscribe((res) => {
      this.categories = res || [];
      this.audienceOptions = this.categories.map((c) => ({ value: c._id, label: c.categoryName }));
    });

    this.form.controls.audienceMode.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      const category = this.form.controls.category;
      category.setValidators(mode === 'specific' ? [Validators.required] : null);
      if (mode === 'all') category.setValue([]);
      category.updateValueAndValidity();
    });

    this.form.controls.publishMode.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      const publishAt = this.form.controls.publishAt;
      publishAt.setValidators(mode === 'schedule' ? [Validators.required, futureDateTime] : null);
      publishAt.updateValueAndValidity();
    });

  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.open && this.form.dirty) event.preventDefault();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] || !this.open) return;
    this.submitted = false;
    this.minDateTime = toLocalInput(new Date());
    this.form.reset({ type: 'general', priority: 'normal', audienceMode: 'all', category: [], publishMode: 'now', pinned: false, requireAck: false });
    if (this.announcement) this.patch(this.announcement);
    this.form.markAsPristine();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isEdit(): boolean {
    return !!this.announcement;
  }

  /** Already went out to readers: the publish time is fixed and it can't go back to draft. */
  get isLive(): boolean {
    const state = this.announcement?.state;
    return state === 'active' || state === 'expired';
  }

  get f() {
    return this.form.controls;
  }

  get value() {
    return this.form.getRawValue();
  }

  get submitLabel(): string {
    if (this.isEdit && this.isLive) return 'Save changes';
    return this.value.publishMode === 'schedule' ? 'Schedule' : 'Publish now';
  }

  get publishedOn(): Date {
    return new Date(this.announcement!.publishAt || this.announcement!.date);
  }

  get title(): string {
    return this.isEdit ? 'Edit announcement' : 'New announcement';
  }

  save(status: 'published' | 'draft'): void {
    this.submitted = true;
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Check the highlighted fields', 'Warning !');
      return;
    }

    const v = this.value;
    const original = this.announcement;
    const publishAt = this.isLive
      ? new Date(original!.publishAt || original!.date)
      : v.publishMode === 'schedule' ? new Date(v.publishAt!) : new Date();

    const payload: announcementPostData = {
      isEdit: this.isEdit,
      _id: original?._id,
      title: v.title?.trim(),
      description: v.description?.trim(),
      category: v.audienceMode === 'specific' && v.category?.length ? v.category : ['all'],
      type: v.type!,
      priority: v.priority!,
      publishAt: publishAt.toISOString(),
      expiresAt: v.expiresAt ? this.endOfDay(v.expiresAt).toISOString() : null,
      link: v.link?.trim() || null,
      pinned: !!v.pinned,
      requireAck: !!v.requireAck,
      status,
    };

    this.saving = status;
    this.service.createAnnouncement(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.saving = null;
        if (res?.success) {
          this.toastr.success(res.message);
          this.form.markAsPristine();
          this.saved.emit();
        }
      },
      error: (error) => {
        this.saving = null;
        this.toastr.error(error?.error?.message || 'Failed to save announcement');
      },
    });
  }

  onDrawerClosed(): void {
    this.closed.emit();
  }

  private patch(item: announcementGetData): void {
    const publishAt = item.publishAt || item.date;
    const isFuture = !!publishAt && new Date(publishAt).getTime() > Date.now();
    this.form.patchValue({
      title: item.title,
      description: item.description,
      type: item.type || (item.celeb ? 'celebration' : 'general'),
      priority: item.priority || 'normal',
      audienceMode: item.category?.length && !item.category.includes('all') ? 'specific' : 'all',
      category: item.category?.filter((c) => c !== 'all') || [],
      publishMode: isFuture && !this.isLive ? 'schedule' : 'now',
      publishAt: isFuture ? toLocalInput(publishAt) : '',
      expiresAt: item.expiresAt ? toDateInput(item.expiresAt) : '',
      link: item.link || '',
      pinned: !!item.pinned,
      requireAck: !!item.requireAck,
    });
  }

  private endOfDay(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
  }

  private expiryAfterPublish(group: AbstractControl): ValidationErrors | null {
    const { expiresAt, publishMode, publishAt } = group.value;
    if (!expiresAt) return null;
    const start = publishMode === 'schedule' && publishAt ? new Date(publishAt) : new Date();
    return this.endOfDay(expiresAt).getTime() <= start.getTime() ? { expiryBeforePublish: true } : null;
  }
}
