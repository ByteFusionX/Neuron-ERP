import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { EventsService } from 'src/app/core/services/events/events.service';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { EventsComponent } from '../events/events.component';
import { ToastrService } from 'ngx-toastr';
import { Events } from '../../interfaces/evets.interface';
import { Router } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';

@Component({
    selector: 'app-events-list',
    imports: [CommonModule, IconsModule, MatDialogModule, MatTooltipModule],
    templateUrl: './events-list.component.html',
    styleUrls: ['./events-list.component.css'],
    providers: [DatePipe]
})
export class EventsListComponent implements OnInit, OnDestroy {

  private subscriptions = new Subscription()
  private eventsSubject = new BehaviorSubject<Events[]>([]);
  events$ = this.eventsSubject.asObservable();
  isReassigned: boolean = false;
  isChecked = false;
  employeeToken!: any;

  constructor(
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EventsListComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { collectionId: string, from: string },
    private _eventsServices: EventsService,
    private toaster: ToastrService,
    private datePipe: DatePipe,
    private router: Router,
    private _employeeServices: EmployeeService,
  ) { }

  ngOnInit(): void {
    if (this.data.collectionId) {
      this.fetchEvents()
    }
    const urlSegment = this.router.url.split('/').pop()
    if (urlSegment == 'reassigned') {
      this.isReassigned = true
    }

    this.employeeToken = this._employeeServices.employeeToken()
  }

  fetchEvents(): void {
    this._eventsServices.fetchEvents(this.data.collectionId).subscribe((events) => {
      this.eventsSubject.next(events);
    });
  }

  ngOnDestroy(): void {
    this.isReassigned = false
    this.subscriptions.unsubscribe()
  }

  onClose() {
    this.dialogRef.close()
  }

  onNewEventClicks() {
    const dialog = this.dialog.open(EventsComponent, { data: this.data })
    dialog.afterClosed().subscribe((res) => {
      if (res) {
        this.fetchEvents()
        this.toaster.success(res.message || 'Event created successfully');
      }
    })
  }

  formatDate(date: Date): string {
    const dateStr = this.datePipe.transform(date, 'd MMMM yyyy, h:mm a');
    return this.addOrdinalSuffix(dateStr!);
  }

  addOrdinalSuffix(dateStr: string): string {
    const day = parseInt(dateStr.split(' ')[0], 10);
    const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 || Math.floor(day / 10) === 1) ? 0 : day % 10];
    return dateStr.replace(day.toString(), `${day}${suffix}`);
  }

  onCheckboxClick(event: Event, eventId: string): void {
    const checkbox = event.target as HTMLInputElement;
    this.isChecked = checkbox.checked;
    if (this.isChecked) {
      this.subscriptions.add(
        this._eventsServices.eventStatus(eventId, 'completed').subscribe((res) => {
          if (res.success === true) {
            this.updateEventStatus(eventId, 'completed');
            this.toaster.success('Event completion updated');
          }
        })
      );
    }
  }

  private updateEventStatus(eventId: string, status: string): void {
    const currentEvents = this.eventsSubject.value;
    const updatedEvents = currentEvents.map((event) =>
      event._id === eventId ? { ...event, status } : event
    );
    this.eventsSubject.next(updatedEvents);
  }

  onDeleteEvent(eventId: string): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Event',
        description: 'Are you sure you want to delete this event?',
        icon: 'heroExclamationCircle',
        IconColor: 'red',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.subscriptions.add(
          this._eventsServices.eventDelete(eventId).subscribe((res) => {
            if (res.success) {
              this.toaster.success('Event Deleted');
              this.removeEvent(eventId);
            }
          })
        );
      }
    });
  }
  
  private removeEvent(eventId: string): void {
    const currentEvents = this.eventsSubject.value;
    const updatedEvents = currentEvents.filter((event) => event._id !== eventId);
    this.eventsSubject.next(updatedEvents);
  }

  isCreatedEmployee(employeeId: string): boolean {
    if (this.employeeToken.id == employeeId) {
      return true;
    }
    return false;
  }
}
