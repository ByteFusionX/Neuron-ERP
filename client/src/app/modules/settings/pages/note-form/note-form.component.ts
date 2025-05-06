import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';
import { ProfileService } from 'src/app/core/services/profile/profile.service';

import { appNoLeadingSpace } from '../../../../shared/directives/trim-validator.directive';

@Component({
    selector: 'app-note-form',
    imports: [
    CommonModule,
    NgIconsModule,
    FormsModule,
    appNoLeadingSpace
],
    templateUrl: './note-form.component.html',
    styleUrls: ['./note-form.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NoteFormComponent {
    isSaving: boolean = false;
    error: boolean = false;

    title!: string;
    noteText!: string;
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
                this.title = 'Edit Customer Note'
                this.createButton = false;
                this.noteText = this.data.note;
                break;
            case 'createCustomerNote':
                this.title = 'Create Customer Note'
                break;
            case 'editTermsAndCondition':
                this.title = 'Edit Terms & Condition'
                this.createButton = false;
                this.noteText = this.data.note;
                break;
            case 'createTermsAndCondition':
                this.title = 'Create Terms & Condition'
                break;
        }

    }

    onCloseClicked() {
        this.dialogRef.close();
    }

    onSubmit() {
        this.isSaving = true;
        if (!this.noteText) {
            this.error = true;
            this.isSaving = false;
        }
        const note = { note: this.noteText };
        const action = this.data.action;
        if (action == 'createCustomerNote') {
            this._profileService.createCustomerNote(note).subscribe((res) => {
                this.dialogRef.close(res);
                this.isSaving = false;
            })
        } else {
            this._profileService.createTermsAndCondition(note).subscribe((res) => {
                this.dialogRef.close(res);
                this.isSaving = false;
            })
        }
    }

    onUpdate() {
        this.isSaving = true;
        if (!this.noteText) {
            this.error = true;
            this.isSaving = false;
        }
        const action = this.data.action;

        let noteType = 'customerNote'
        if (action == 'editTermsAndCondition') {
            noteType = 'termsAndConditions'
        }

        const updateNodeData = {
            note: this.noteText,
            noteType: noteType
        }
        this._profileService.updateNote(updateNodeData,this.data.noteId).subscribe((res) => {
            this.dialogRef.close(res);
            this.isSaving = false;
        })
    }
}


