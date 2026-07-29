import { Directive, HostListener, ElementRef } from '@angular/core';

@Directive({ selector: '[appNoNegativeNumber]' })
export class appNoNegativeNumber {
  constructor(private el: ElementRef) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (['-', '+', 'e', 'E'].includes(event.key)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    if (/[-+eE]/.test(pastedText)) {
      event.preventDefault();
    }
  }

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const element = this.el.nativeElement as HTMLInputElement;
    if (element.value !== '' && Number(element.value) < 0) {
      element.value = '';
      element.dispatchEvent(new Event('input'));
    }
  }
}
