import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

interface Option {
  id: string;
  name: string;
}

@Component({
  selector: 'app-radio-group',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './radio-group.component.html',
  styleUrl: './radio-group.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioGroupComponent),
      multi: true
    }
  ]
})
export class RadioGroupComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() options: Option[] = [];
  @Input() isSubmitted = false;
  @Input() showOtherOption = false;
  
  value: string = '';
  otherValue: string = '';
  disabled = false;
  
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: any): void {
    if (typeof value === 'object' && value?.type === 'other' && value?.value) {
      this.value = 'other';
      this.otherValue = value.value;
    } else {
      this.value = value;
      this.otherValue = '';
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
  }

  onSelectionChange(optionId: string): void {
    if (optionId === 'other') {
      this.value = 'other';
      this.emitValue();
    } else {
      this.value = optionId;
      this.otherValue = '';
      this.onChange(this.value);
    }
    this.onTouched();
  }

  onOtherValueChange(event: any): void {
    this.otherValue = event.target.value;
    this.emitValue();
  }

  emitValue(): void {
    if (this.value === 'other') {
      this.onChange(this.otherValue);
    } else {
      this.onChange(this.value);
    }
  }
}