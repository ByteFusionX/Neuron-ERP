import { Directive, HostListener, ElementRef } from '@angular/core';

@Directive({
    selector: '[appNegativeNumber]',
    standalone: false
})
export class NegativeNumberDirective {

  constructor(private el: ElementRef) {}

  @HostListener('input', ['$event'])
  onInput(event: KeyboardEvent): void {
    const inputElement = this.el.nativeElement as HTMLInputElement;
    const inputValue = inputElement.value;
    const newValue = inputValue.replace(/[^0-9.]/g, ''); 
    if (newValue !== inputValue || newValue === '.') {
      inputElement.value = newValue;
      event.preventDefault();
    }
  }
}
