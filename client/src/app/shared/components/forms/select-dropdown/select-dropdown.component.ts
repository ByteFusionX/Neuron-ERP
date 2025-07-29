import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { NgSelectComponent, NgOptionComponent } from '@ng-select/ng-select';

@Component({
  selector: 'app-select-dropdown',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgSelectComponent, NgOptionComponent],
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

  onSelectionChange(event: any): void {
    this.value = event;
    this.onChange(event);
    this.onSelected.emit(event);
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
