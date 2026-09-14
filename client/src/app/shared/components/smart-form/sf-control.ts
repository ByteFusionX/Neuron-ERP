import { ChangeDetectorRef, Directive, Input, booleanAttribute, inject } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';

let nextId = 0;

/** Base for every smart-form control: wires the component into formControlName / ngModel. */
@Directive()
export abstract class SfControl<V = any> implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() inputId = `sf-${++nextId}`;
  @Input({ transform: booleanAttribute }) readonly = false;

  value: V | null = null;
  disabled = false;

  protected cdr = inject(ChangeDetectorRef);
  private onChange: (v: V | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: V | null): void {
    this.value = v;
    this.valueWritten();
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (v: V | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.cdr.markForCheck();
  }

  update(v: V | null): void {
    this.value = v;
    this.onChange(v);
  }

  touch(): void { this.onTouched(); }

  protected valueWritten(): void {}
}
