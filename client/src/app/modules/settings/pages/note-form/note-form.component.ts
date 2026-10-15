import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

@Component({
    selector: 'app-note-form',
    imports: [
    CommonModule,
    ReactiveFormsModule,
    SmartFormModule,
    FormModalShellComponent
],
    templateUrl: './note-form.component.html',
    styles: [':host{display:block}']
})
export class NoteFormComponent {
    isSaving: boolean = false;
    note = new FormControl('', Validators.required);

    title!: string;
    subtitle!: string;
    createButton: boolean = true;

    submitted = false;
    dialogRef = inject<ModalRef<any>>(ModalRef);
    data = inject(MODAL_DATA, { optional: true }) as any ?? {};
    private _profileService = inject(ProfileService);

    /** Set when the grid opens the form with a choice of note types (create only). */
    typeOptions: { label: string; value: string }[] = [];
    type = new FormControl('');

    private static readonly CREATORS: Record<string, string> = {
        customerNotes: 'createCustomerNote',
        termsAndConditions: 'createTermsAndCondition',
        placeOfDelivery: 'createPlaceOfDelivery',
        shippingTerms: 'createShippingTerms',
        purchaseTermsNotes: 'createPurchaseTermsNote',
    };

    ngOnInit() {
        if (this.data.types?.length) {
            this.typeOptions = this.data.types.map((t: { key: string; label: string }) => ({ label: t.label, value: t.key }));
            this.type.setValue(this.data.typeKey ?? this.typeOptions[0].value);
            const edit = !!this.data.noteId;
            this.createButton = !edit;
            this.title = edit ? `Edit ${this.data.typeLabel ?? 'note'}` : 'Add note';
            this.subtitle = edit ? 'Update this entry.' : 'Choose where it is used, then enter the text.';
            if (edit) this.note.setValue(this.data.note);
            return;
        }
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
            case 'editPlaceOfDelivery':
                this.title = 'Edit place of delivery'
                this.subtitle = 'Update this delivery location used on purchase documents.'
                this.createButton = false;
                this.note.setValue(this.data.note);
                break;
            case 'createPlaceOfDelivery':
                this.title = 'Create place of delivery'
                this.subtitle = 'A delivery location used on purchase documents.'
                break;
            case 'editShippingTerms':
                this.title = 'Edit shipping terms'
                this.subtitle = 'Update this shipping term used on purchase documents.'
                this.createButton = false;
                this.note.setValue(this.data.note);
                break;
            case 'createShippingTerms':
                this.title = 'Create shipping terms'
                this.subtitle = 'A shipping term used on purchase documents.'
                break;
        }

    }

    onCloseClicked() {
        this.dialogRef.close();
    }

    onSubmit() {
        this.submitted = true;
        if (!this.note.value?.trim()) {
            this.note.setErrors({ required: true });
            this.note.markAsTouched();
            return;
        }
        if (this.data.types?.length) {
            // Master data hosts the save so it goes through the master-list API.
            this.dialogRef.close({ key: this.type.value, note: this.note.value!.trim() });
            return;
        }
        this.isSaving = true;
        const note = { note: this.note.value! };
        const action = this.data.types?.length
            ? NoteFormComponent.CREATORS[this.type.value ?? ''] ?? this.data.action
            : this.data.action;
        if (action == 'createPurchaseTermsNote') {
            this._profileService.createPurchaseTermsNote(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        } else if (action == 'createCustomerNote') {
            this._profileService.createCustomerNote(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        } else if (action == 'createTermsAndCondition') {
            this._profileService.createTermsAndCondition(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        } else if (action == 'createPlaceOfDelivery') {
            this._profileService.createPlaceOfDelivery(note).subscribe({
                next: (res) => {
                    this.dialogRef.close(res);
                    this.isSaving = false;
                },
                error: () => {
                    this.isSaving = false;
                }
            })
        } else {
            this._profileService.createShippingTerms(note).subscribe({
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
        this.submitted = true;
        if (!this.note.value?.trim()) {
            this.note.setErrors({ required: true });
            this.note.markAsTouched();
            return;
        }
        if (this.data.types?.length) {
            this.dialogRef.close({ key: this.type.value, note: this.note.value!.trim() });
            return;
        }
        this.isSaving = true;
        const action = this.data.action;

        let noteType = 'customerNote'
        if (this.data.types?.length) {
            const key = this.type.value ?? '';
            noteType = key === 'customerNotes' ? 'customerNote' : key;
        } else if (action == 'editTermsAndCondition') {
            noteType = 'termsAndConditions'
        } else if (action == 'editPlaceOfDelivery') {
            noteType = 'placeOfDelivery'
        } else if (action == 'editShippingTerms') {
            noteType = 'shippingTerms'
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


