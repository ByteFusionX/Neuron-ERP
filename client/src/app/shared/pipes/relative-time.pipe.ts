import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'relativeTime',
  standalone: true, // Makes the pipe standalone
})
export class RelativeTimePipe implements PipeTransform {
  transform(value: Date | string | number): string {
    if (!value) return '';

    const now = new Date();
    const inputDate = new Date(value);
    const diffInMs = now.getTime() - inputDate.getTime();

    const seconds = Math.floor(diffInMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(weeks / 4);
    const years = Math.floor(months / 12);

    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
    if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    if (weeks > 0) {
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return `just now`;
  }
}
