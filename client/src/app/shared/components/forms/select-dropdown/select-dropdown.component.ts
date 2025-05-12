import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-select-dropdown',
  imports: [CommonModule,FormsModule,ReactiveFormsModule],
  templateUrl: './select-dropdown.component.html',
  styleUrl: './select-dropdown.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectDropdownComponent),
      multi: true
    }
  ]
})
export class SelectDropdownComponent {
  @Input() label = '';
  @Input() options: any[] = [];
  @Input() optionLabel = 'name';
  @Input() optionValue = 'id';
  @Input() placeholder = 'Select...';
  @Input() isSubmitted = false;
  @Input() multiple = false;
  @Input() id = '';
  @Input() selected: string = '';

  value: any = '';
  disabled = false;
  onChange: any = () => { };
  onTouched: any = () => { };
  @Output() onSelected = new EventEmitter<string | string[]>()

  ngOnInit() {
    if (!this.id) {
      this.id = this.label.toLowerCase().replace(/\s+/g, '-');
    }
  }

  getOptionLabel(option: any): string {
    return option[this.optionLabel];
  }

  getOptionValue(option: any): any {
    return option[this.optionValue];
  }

  isSelected(option: any): boolean {
    if (this.multiple && Array.isArray(this.value)) {
      return this.value.includes(this.getOptionValue(option));
    }
    return this.value === this.getOptionValue(option);
  }

  onSelectionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.multiple) {
      const values = Array.from(select.selectedOptions).map(option => option.value);
      this.value = values;
      this.onChange(values);
      this.onSelected.emit(values)
    } else {
      const value = select.value;
      this.value = value;
      this.onChange(value);
      this.onSelected.emit(value)
    }

    this.onTouched();
  }

  writeValue(value: any): void {
    this.value = value;
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
}
