import { AfterViewInit, Directive, ElementRef } from '@angular/core';

@Directive({ selector: '[dgAutofocus]', standalone: true })
export class DataGridAutofocusDirective implements AfterViewInit {
  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const el = this.el.nativeElement;
    el.focus();
    if (el instanceof HTMLInputElement && el.type === 'text') el.select();
  }
}
