import { Injectable, inject } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { EventsService } from 'src/app/core/services/events/events.service';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { EnquiryService } from 'src/app/core/services/enquiry/enquiry.service';
import { ModalService } from 'src/app/shared/components/modal';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { SfOption } from 'src/app/shared/components/smart-form';
import { DetailTaskItem } from 'src/app/shared/components/detail-panel/detail-panel.model';
import { EventCreateModalComponent, EventModalResult } from 'src/app/shared/components/detail-panel/task-create-modal/event-create-modal.component';
import { ContactDetail } from 'src/app/shared/interfaces/customer.interface';
import { Events } from 'src/app/shared/interfaces/evets.interface';

export interface CreateEventOptions {
  /** Id of the record the event hangs off (sent as `collectionId`). */
  collectionId: string;
  /** Human reference shown in the create modal header (e.g. quote number). */
  context: string;
  /** Backend `from` discriminator. */
  from: string;
  contactDetails?: ContactDetail[];
}

export type EventOutcome = 'success' | 'cancelled';

/**
 * Stateless event actions (create / complete / outcome / delete / file delete / preview) for the shared
 * `app-detail-task-list` events tab. Each action handles confirmation + toast and emits `true` when the
 * server accepted the change, so the caller only has to update its own event list.
 */
@Injectable({ providedIn: 'root' })
export class EventActionsService {
  private events = inject(EventsService);
  private employees = inject(EmployeeService);
  private enquiries = inject(EnquiryService);
  private modal = inject(ModalService);
  private confirm = inject(ConfirmDialogService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastrService);

  /** Maps raw events to detail-panel task rows. */
  toItems(events: Events[]): DetailTaskItem[] {
    return (events || []).map((e) => ({
      id: e._id,
      title: e.event,
      kind: 'event' as const,
      date: e.date as any,
      done: e.status === 'completed' || e.status === 'success',
      eventStatus: (e.status || 'pending') as DetailTaskItem['eventStatus'],
      outcomeable: true,
      assignee: e.employee ? `Assigned to ${[e.employee.firstName, e.employee.lastName].filter(Boolean).join(' ') || e.employee.fullName || ''}`.trim() : undefined,
      description: e.summary,
      deletable: this.isCreator(e.createdBy),
      attachments: (e.eventFiles || []).map((f) => ({ id: f.fileName, name: f.originalname })),
    }));
  }

  create(opts: CreateEventOptions): Observable<boolean> {
    const contactPersons: SfOption[] = (opts.contactDetails || []).map((c) => ({
      label: `${c.firstName} ${c.lastName}`,
      value: c._id,
    }));

    return new Observable<boolean>((subscriber) => {
      this.modal.open<EventModalResult>(EventCreateModalComponent, {
        width: '560px',
        data: {
          context: opts.context,
          assignable: true,
          employees: this.employees.getAllEmployees(),
          contactPersonable: true,
          contactPersons,
          requireSummary: true,
        },
      }).afterClosed().subscribe((event) => {
        if (!event) { subscriber.next(false); subscriber.complete(); return; }
        const formData = new FormData();
        formData.append('eventData', JSON.stringify({
          from: opts.from,
          collectionId: opts.collectionId,
          event: event.title,
          date: event.date,
          employee: event.employeeId,
          contactPerson: event.contactPersonId,
          summary: event.description,
        }));
        this.events.newEvent(formData).subscribe({
          next: (res) => {
            if (res?.event) { this.toast.success(res.message || 'Event created successfully'); }
            subscriber.next(!!res?.event);
            subscriber.complete();
          },
          error: () => { this.toast.error('Failed to create event'); subscriber.next(false); subscriber.complete(); },
        });
      });
    });
  }

  markCompleted(item: DetailTaskItem): Observable<boolean> {
    if (item.done) { return of(false); }
    return this.events.eventStatus(item.id, 'completed').pipe(
      map((res: any) => {
        if (res.success !== true) { return false; }
        this.toast.success('Event completion updated');
        return true;
      }),
    );
  }

  async setOutcome(item: DetailTaskItem, status: EventOutcome): Promise<Observable<boolean>> {
    const success = status === 'success';
    const { confirmed } = await this.confirm.open({
      tone: success ? 'approve' : 'reject',
      title: success ? 'Mark Event Successful' : 'Cancel Event',
      message: success ? 'Mark this event as successful?' : 'Mark this event as cancelled?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: success ? 'Mark successful' : 'Cancel event',
      cancelLabel: 'Keep as is',
    });
    if (!confirmed) { return of(false); }
    return this.events.eventStatus(item.id, status).pipe(
      map((res: any) => {
        if (res.success !== true) { return false; }
        this.toast.success(success ? 'Event marked successful' : 'Event cancelled');
        return true;
      }),
    );
  }

  async delete(item: DetailTaskItem): Promise<Observable<boolean>> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event?',
      details: [{ label: 'Event', value: item.title }],
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    if (!confirmed) { return of(false); }
    return this.events.eventDelete(item.id).pipe(
      map((res: any) => {
        if (!res.success) { return false; }
        this.toast.success('Event Deleted');
        return true;
      }),
    );
  }

  deleteFile(item: DetailTaskItem, file: { id: string; name: string }): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: { title: 'Delete File', description: 'Are you sure you want to delete this file?', icon: 'heroExclamationCircle', IconColor: 'red' },
        })
        .afterClosed()
        .subscribe((confirmed: boolean) => {
          if (!confirmed) { subscriber.next(false); subscriber.complete(); return; }
          this.events.eventFileDelete(item.id, file.id).subscribe((res: any) => {
            if (res.success) { this.toast.success('File Deleted'); }
            subscriber.next(!!res.success);
            subscriber.complete();
          });
        });
    });
  }

  previewFile(file: { id: string; name: string }): void {
    this.enquiries.downloadFile(file.id).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Response) {
          const fileURL = URL.createObjectURL(new Blob([event.body], { type: event.body.type || 'application/octet-stream' }));
          window.open(fileURL, '_blank');
          setTimeout(() => URL.revokeObjectURL(fileURL), 10000);
        }
      },
      error: (error) => {
        if (error.status === 404) {
          this.toast.warning('Sorry, the requested file was not found on the server.');
        } else {
          this.toast.error('An error occurred while trying to preview the file.');
        }
      },
    });
  }

  private isCreator(createdBy: any): boolean {
    const employeeId = this.employees.employeeToken()?.id;
    if (!employeeId || !createdBy) { return false; }
    const idToCompare = typeof createdBy === 'string' ? createdBy : createdBy._id || createdBy;
    return employeeId == idToCompare;
  }
}
