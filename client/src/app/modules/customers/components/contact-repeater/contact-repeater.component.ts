import { AfterViewInit, Component, EventEmitter, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SfOption, SmartFormModule } from 'src/app/shared/components/smart-form';

/** Add/remove list of contact-detail cards bound to a FormArray of contact FormGroups. */
@Component({
  selector: 'app-customer-contact-repeater',
  standalone: true,
  imports: [NgFor, NgIf, ReactiveFormsModule, SmartFormModule],
  template: `
    <div *ngFor="let contact of contacts.controls; let i = index" [formGroup]="contact"
      class="rounded-lg border border-gray-200 p-3 dark:border-erp-border-dark">
      <div class="flex items-center justify-between gap-2" [class.mb-3]="isOpen(contact, i)">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" [attr.aria-expanded]="isOpen(contact, i)" (click)="toggle(contact, i)">
          <svg class="h-4 w-4 shrink-0 text-gray-500 transition-transform" [class.-rotate-90]="!isOpen(contact, i)" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{{ contact.value.isPrimary ? 'Primary contact' : 'Contact ' + (i + 1) }}</span>
          <span *ngIf="contact.value.isPrimary" class="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Primary</span>
          <span *ngIf="!isOpen(contact, i) && summary(contact)" class="truncate text-xs text-gray-500">· {{ summary(contact) }}</span>
        </button>
        <div class="flex items-center gap-3">
          <button *ngIf="!contact.value.isPrimary" type="button" class="text-xs text-violet-600 hover:underline dark:text-violet-400" (click)="setPrimary(contact)">Set as primary</button>
          <button *ngIf="contacts.length > 1" type="button" class="text-xs text-red-600 hover:underline dark:text-red-400" (click)="remove.emit(i)">Remove</button>
        </div>
      </div>
      <div *ngIf="isOpen(contact, i)">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr_1fr]">
        <app-sf-field label="Title" [control]="contact.controls['courtesyTitle']">
          <app-sf-select formControlName="courtesyTitle" [options]="titleOptions" placeholder="Title"></app-sf-select>
        </app-sf-field>
        <app-sf-field label="First Name" [control]="contact.controls['firstName']">
          <app-sf-input formControlName="firstName" placeholder="First name"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Last Name" [control]="contact.controls['lastName']">
          <app-sf-input formControlName="lastName" placeholder="Last name"></app-sf-input>
        </app-sf-field>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <app-sf-field label="Email" [control]="contact.controls['email']">
          <app-sf-input formControlName="email" type="email" placeholder="name@company.com"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Phone No" [control]="contact.controls['phoneNo']">
          <app-sf-input formControlName="phoneNo" type="tel" placeholder="Phone number"></app-sf-input>
        </app-sf-field>
        <app-sf-field label="Department" [control]="contact.controls['department']">
          <app-sf-combobox formControlName="department" [options]="departmentOptions" placeholder="Select department"></app-sf-combobox>
        </app-sf-field>
        <app-sf-field label="Designation" [control]="contact.controls['designation']">
          <app-sf-input formControlName="designation" placeholder="e.g. Procurement Manager"></app-sf-input>
        </app-sf-field>
      </div>
      </div>
    </div>
  `,
})
export class CustomerContactRepeaterComponent implements AfterViewInit {
  private readonly openState = new Map<FormGroup, boolean>();
  private initialised = false;

  ngAfterViewInit(): void { this.initialised = true; }

  /** First contact starts open; contacts added later open too, so the new card is ready to fill. */
  isOpen(contact: FormGroup, i: number): boolean {
    if (!this.openState.has(contact)) this.openState.set(contact, i === 0 || this.initialised);
    return this.openState.get(contact)!;
  }

  toggle(contact: FormGroup, i: number): void {
    this.openState.set(contact, !this.isOpen(contact, i));
  }

  setPrimary(target: FormGroup): void {
    this.contacts.controls.forEach((g) => g.patchValue({ isPrimary: g === target }));
    this.contacts.markAsDirty();
  }

  summary(contact: FormGroup): string {
    const v = contact.value;
    return [v.firstName, v.lastName].filter(Boolean).join(' ');
  }

  @Input({ required: true }) contacts!: FormArray<FormGroup>;
  @Input() titleOptions: SfOption[] = [];
  @Input() departmentOptions: SfOption[] = [];
  @Output() add = new EventEmitter<void>();
  @Output() remove = new EventEmitter<number>();
}
