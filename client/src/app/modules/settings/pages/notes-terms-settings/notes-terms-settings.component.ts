import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NgIf, NgFor } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import { Subscription, filter, take } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { Privileges } from 'src/app/shared/interfaces/employee.interface';
import { MatTableDataSource } from '@angular/material/table';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { NoteFormComponent } from '../note-form/note-form.component';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { SkeltonLoadingComponent } from '../../../../shared/components/skelton-loading/skelton-loading.component';

@Component({
  selector: 'app-notes-terms-settings',
  standalone: true,
  templateUrl: './notes-terms-settings.component.html',
  styleUrls: ['./notes-terms-settings.component.css'],
  imports: [SettingsSectionHeaderComponent, NgIf, NgFor, NgIcon, ActionButtonComponent, SkeltonLoadingComponent],
})
export class NotesTermsSettingsComponent implements OnInit, OnDestroy {
  privileges!: Privileges | undefined;
  isNotesLoading: boolean = true;
  cstcDisplayedColumns: string[] = ['customerNote', 'termsCondition'];
  cstcDataSource: any = new MatTableDataSource();

  readonly columns = [
    { key: 'customerNotes', title: 'Customer Notes', createLabel: '+ Create Customer Note', createAction: 'createCustomerNote', editAction: 'editCustomerNote', empty: 'No customer notes yet' },
    { key: 'termsAndConditions', title: 'Terms & Conditions', createLabel: '+ Create Terms & Conditions', createAction: 'createTermsAndCondition', editAction: 'editTermsAndCondition', empty: 'No terms & conditions yet' },
  ];

  private subscriptions = new Subscription();
  private confirm = inject(ConfirmDialogService);

  notesFor(key: string): any[] {
    return this.cstcDataSource.data[0]?.[key] ?? [];
  }

  constructor(
    private _profileService: ProfileService,
    public dialog: MatDialog,
    private _employeeService: EmployeeService,
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this._employeeService.employeeData$.pipe(filter((e) => !!e), take(1)).subscribe((employee) => {
        this.privileges = employee?.category?.privileges;

        if (this.privileges?.portalManagement?.notesAndTerms) {
          this.subscriptions.add(
            this._profileService.getNotes().subscribe({
              next: (data) => {
                this.cstcDataSource.data = data ? [data] : [];
                this.isNotesLoading = false;
              },
              error: () => {
                this.isNotesLoading = false;
              }
            })
          );
        }
      })
    );
  }

  onNoteForm(action: string, note?: string, noteId?: string) {
    const dialogRef = this.dialog.open(NoteFormComponent, {
      width: '560px', maxWidth: '95vw',
      data: { action, note, noteId }
    });
    dialogRef.afterClosed().subscribe(data => {
      if (data) {
        this.cstcDataSource.data = [data];
      }
    });
  }

  async onNoteDelete(noteType: string, noteId: string) {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Note?',
      message: 'Are you sure you want to delete this note?',
      consequence: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this._profileService.deleteNote(noteType, noteId).subscribe((res) => {
      if (res.success) {
        let noteData = this.cstcDataSource.data[0];
        if (noteType === "customerNotes" || noteType === "termsAndConditions") {
          const index = noteData[noteType].findIndex((note: any) => note._id === noteId);
          if (index !== -1) {
            noteData[noteType].splice(index, 1);
          }
        }
        this.cstcDataSource.data = [noteData];
      }
    });
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
