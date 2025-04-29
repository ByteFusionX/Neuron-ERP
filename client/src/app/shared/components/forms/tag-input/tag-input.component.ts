import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tag-input.component.html',
  styleUrl: './tag-input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TagInputComponent),
      multi: true
    }
  ]
})
export class TagInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = 'Add new item...';
  @Input() isSubmitted = false;
  @Input() id = '';

  tags: string[] = [];
  inputValue = '';
  disabled = false;
  onChange: any = () => {};
  onTouched: any = () => {};

  ngOnInit() {
    if (!this.id) {
      this.id = this.label.toLowerCase().replace(/\s+/g, '-');
    }
  }

  onInputChange(event: Event): void {
    this.inputValue = (event.target as HTMLInputElement).value;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addCurrentTag();
    }
  }

  addCurrentTag(): void {
    const value = this.inputValue.trim();
    if (value && !this.tags.includes(value)) {
      this.tags = [...this.tags, value];
      this.inputValue = '';
      this.emitChange();
    }
  }

  removeTag(index: number): void {
    this.tags = this.tags.filter((_, i) => i !== index);
    this.emitChange();
  }

  emitChange(): void {
    this.onChange(this.tags);
    this.onTouched();
  }

  writeValue(value: string[]): void {
    if (Array.isArray(value)) {
      this.tags = value;
    } else if (typeof value === 'string' && value) {
      // Handle case where value is comma-separated string
      this.tags = (value as string).split(',').map((item: string) => item.trim()).filter((item: string) => item);
    } else {
      this.tags = [];
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
}