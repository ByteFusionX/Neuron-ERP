import { Directive, HostListener, ElementRef } from '@angular/core';

@Directive({ selector: '[appNoLeadingSpace]' })
export class appNoLeadingSpace {

  constructor(private el: ElementRef) {}

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const element = this.el.nativeElement as HTMLInputElement | HTMLTextAreaElement;
    const value = element.value;
    if (value.startsWith(' ')) {
      element.value = value.trimStart();
      element.dispatchEvent(new Event('input'));
    }
  }
}