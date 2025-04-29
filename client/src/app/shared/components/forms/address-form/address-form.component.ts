
import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormBuilder, FormGroup, NG_VALUE_ACCESSOR, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-address-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './address-form.component.html',
  styleUrl: './address-form.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AddressFormComponent),
      multi: true
    }
  ]
})
export class AddressFormComponent  implements ControlValueAccessor{
  @Output() addressChange = new EventEmitter<any>();

  addressForm: FormGroup;
  disabled = false;
  onChange: any = () => { };
  onTouched: any = () => { };

  constructor(private fb: FormBuilder) {
    this.addressForm = this.fb.group({
      streetNo: [''],
      zoneNo: [''],
      buildingNo: [''],
      poBox: [''],
      location: ['', Validators.required]
    });

    this.addressForm.valueChanges.subscribe(value => {
      this.onChange(value);
      this.addressChange.emit(value);
    });
  }

  writeValue(value: any): void {
    if (value) {
      this.addressForm.setValue(value, { emitEvent: false });
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.addressForm.disable();
    } else {
      this.addressForm.enable();
    }
  }
}
