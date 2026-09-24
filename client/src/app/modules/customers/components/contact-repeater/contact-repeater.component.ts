import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/** Add/remove list of contact-detail cards bound to a FormArray of contact FormGroups. */
@Component({
  selector: 'app-customer-contact-repeater',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule, SmartFormModule, ActionButtonComponent],
  template: `
    <div *ngFor="let contact of contacts.controls; let i = index" [formGroup]="contact"
      class="rounded-lg border border-gray-200 p-3 dark:border-erp-border-dark">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{{ i === 0 ? 'Primary contact' : 'Contact ' + (i + 1) }}</span>
        <button *ngIf="i > 0" type="button" class="text-xs text-red-600 hover:underline dark:text-red-400" (click)="remove.emit(i)">Remove</button>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-sf-field label="Title" [control]="contact.controls['courtesyTitle']">
          <app-sf-radio-group formControlName="courtesyTitle" variant="segmented" [options]="titleOptions"></app-sf-radio-group>
        </app-sf-field>
        <app-sf-field label="Department" [control]="contact.controls['department']">
          <app-sf-combobox formControlName="department" [options]="departmentOptions" placeholder="Select department"></app-sf-combobox>
        </app-sf-field>
        <app-sf-field label="First Name" [control]="contact.controls['firstName']">
          <app-sf-input formControlName="firstName" placeholder="First name"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Last Name" [control]="contact.controls['lastName']">
          <app-sf-input formControlName="lastName" placeholder="Last name"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Designation" [control]="contact.controls['designation']">
          <app-sf-input formControlName="designation" placeholder="e.g. Procurement Manager"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Contact Role" [control]="contact.controls['role']">
          <app-sf-select formControlName="role" [options]="roleOptions"></app-sf-select>
        </app-sf-field>
        <app-sf-field label="Email" [control]="contact.controls['email']">
          <app-sf-input formControlName="email" type="email" placeholder="Email"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Phone No" [control]="contact.controls['phoneNo']">
          <app-sf-input formControlName="phoneNo" type="tel" placeholder="Phone number"></app-sf-input>
        </app-sf-field>
      </div>
    </div>
    <div>
      <app-action-button variant="tool" (click)="add.emit()">+ Add Contact</app-action-button>
    </div>
  `,
})
export class CustomerContactRepeaterComponent {
  @Input({ required: true }) contacts!: FormArray<FormGroup>;
  @Input() titleOptions: SfOption[] = [];
  readonly roleOptions: SfOption[] = ['Decision Maker', 'Buyer', 'Technical', 'Accounts', 'Other'].map((r) => ({ label: r, value: r }));
  @Input() departmentOptions: SfOption[] = [];
  @Output() add = new EventEmitter<void>();
  @Output() remove = new EventEmitter<number>();
}
