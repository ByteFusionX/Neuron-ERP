import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Pipe({ name: 'parseBracketsText' })
export class ParseBracketsTextPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string) {
    if (!value) return ''; 
    const regex = /\{(.*?)\}/g;
    const replacedValue = value.replace(regex, '<span class="highlighted-text">$1</span>');
    return replacedValue;
  }
}
