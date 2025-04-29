import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormBuilder, FormGroup, NG_VALUE_ACCESSOR, ReactiveFormsModule, Validators } from '@angular/forms';


@Component({
  selector: 'app-contact-details-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-details-form.component.html',
  styleUrl: './contact-details-form.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ContactDetailsFormComponent),
      multi: true
    }
  ]
})
export class ContactDetailsFormComponent implements ControlValueAccessor { 
  @Input() isSubmitted = false;
  @Output() contactChange = new EventEmitter<any>();
  
  contactForm: FormGroup;
  disabled = false;
  onChange: any = () => {};
  onTouched: any = () => {};
  
  constructor(private fb: FormBuilder) {
    this.contactForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNumber: ['', Validators.required]
    });
    
    this.contactForm.valueChanges.subscribe(value => {
      this.onChange(value);
      this.contactChange.emit(value);
    });
  }
  
  writeValue(value: any): void {
    if (value) {
      this.contactForm.setValue(value, { emitEvent: false });
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
      this.contactForm.disable();
    } else {
      this.contactForm.enable();
    }
  }
}
