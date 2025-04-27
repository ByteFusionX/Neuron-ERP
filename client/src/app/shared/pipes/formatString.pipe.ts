import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'formatString',
    standalone: false
})
export class FormatStringPipe implements PipeTransform {

  transform(value: string): string {
    if (!value) return value;

    // Split the string by '&'
    let parts = value.split('&');

    // Trim and capitalize each part
    parts = parts.map(part => part.trim().charAt(0).toUpperCase() + part.slice(1));

    // Join the parts with ' & '
    return parts.join(' & ');
  }

}