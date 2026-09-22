import { Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

/** Line1/Line2/City/State/Country/Postal fields, bound to any structured-address FormGroup. */
@Component({
  selector: 'app-customer-address-fields',
  standalone: true,
  imports: [ReactiveFormsModule, SmartFormModule],
  template: `
    <div class="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-3" [formGroup]="group">
      <app-sf-field full label="Address Line 1">
        <app-sf-input formControlName="line1" placeholder="Street, building, floor"></app-sf-input>
      </app-sf-field>
      <app-sf-field full label="Address Line 2">
        <app-sf-input formControlName="line2" placeholder="Apartment, suite, landmark (optional)"></app-sf-input>
      </app-sf-field>
      <app-sf-field label="City">
        <app-sf-input formControlName="city" placeholder="City"></app-sf-input>
      </app-sf-field>
      <app-sf-field label="State / Emirate">
        <app-sf-input formControlName="state" placeholder="State or emirate"></app-sf-input>
      </app-sf-field>
      <app-sf-field label="Country">
        <app-sf-input formControlName="country" placeholder="Country"></app-sf-input>
      </app-sf-field>
      <app-sf-field label="Postal / PO Box">
        <app-sf-input formControlName="postalCode" placeholder="Postal code or PO box"></app-sf-input>
      </app-sf-field>
    </div>
  `,
})
export class CustomerAddressFieldsComponent {
  @Input({ required: true }) group!: FormGroup;
}
