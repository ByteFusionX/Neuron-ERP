import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'numberShortener',
    standalone: true
})
export class NumberShortenerPipe implements PipeTransform {

    transform(value: number): string {
        if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'B'; // Convert to billions
        } else if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M'; // Convert to millions
        } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K'; // Convert to thousands
        } else {
            return value.toFixed(2).toString(); // Return as is for smaller numbers
        }
    }

}
