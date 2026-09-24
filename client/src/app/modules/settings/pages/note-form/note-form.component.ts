import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

@Component({
    selector: 'app-note-form',
    imports: [
    CommonModule,
    ReactiveFormsModule,
    SmartFormModule,
    DetailPanelIconComponent,
    ActionButtonComponent
],
    templateUrl: './note-form.component.html',
    styleUrls: ['./note-form.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoteFormComponent {
    isSaving: boolean = false;
    note = new FormControl('', Validators.required);

    title!: string;
    subtitle!: string;
    createButton: boolean = true;

    constructor(
        public dialogRef: MatDialogRef<NoteFormComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private _profileService: ProfileService
    ) { }

    ngOnInit() {
        const action = this.data.action;
        switch (action) {
            case 'editCustomerNote':
                this.title = 'Edit customer note'
                this.subtitle = 'Update this note shown to customers.'
                this.createButton = false;
                this.note.setValue(this.data.note);
                break;
            case 'createCustomerNote':
                this.title = 'Create customer note'
                this.subtitle = 'A note shown to customers on documents.'
                break;
            case 'editTermsAndCondition':
                this.title = 'Edit terms & condition'
                this.subtitle = 'Update this term or condition.'
                this.createButton = false;
                this.note.setValue(this.data.note);
                break;
            case 'createTermsAndCondition':
                this.title = 'Create terms & condition'
                this.subtitle = 'A term or condition included on documents.'
                break;
        }

    }

    onCloseClicked() {
        this.dialogRef.close();
    }

    onSubmit() {
        if (!this.note.value?.trim()) {
            this.note.setErrors({ required: true });
            this.note.markAsTouched();
            return;
        }
        this.isSaving = true;
        const note = { note: this.note.value! };
        const action = this.data.action;
        if (action == 'createCustomerNote') {
            this._profileService.createCustomerNote(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        } else {
            this._profileService.createTermsAndCondition(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        }
    }

    onUpdate() {
        if (!this.note.value?.trim()) {
            this.note.setErrors({ required: true });
            this.note.markAsTouched();
            return;
        }
        this.isSaving = true;
        const action = this.data.action;

        let noteType = 'customerNote'
        if (action == 'editTermsAndCondition') {
            noteType = 'termsAndConditions'
        }

        const updateNodeData = {
            note: this.note.value!,
            noteType: noteType
        }
        this._profileService.updateNote(updateNodeData,this.data.noteId).subscribe({
            next: (res) => {
                this.dialogRef.close(res);
                this.isSaving = false;
            },
            error: () => {
                this.isSaving = false;
            }
        })
    }
}


