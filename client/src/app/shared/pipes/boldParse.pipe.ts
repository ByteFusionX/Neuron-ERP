import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'parseBoldText',
    standalone: false
})
export class ParseBoldTextPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return ''; 
    const regex = /\*\*(.*?)\*\*/g;
    return value.replace(regex, '<b>$1</b>');
  }
}
