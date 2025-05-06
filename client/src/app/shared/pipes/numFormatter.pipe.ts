import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'numberFormatter' })
export class NumberFormatterPipe implements PipeTransform {
    transform(value: number, ...args: unknown[]): string {
        if (isNaN(value)) {
          return '';
        }

        return value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
}
