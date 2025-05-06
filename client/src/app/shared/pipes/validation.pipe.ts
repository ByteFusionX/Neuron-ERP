import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'validation',
  standalone: true,
})
export class ValidationPipe implements PipeTransform {

  transform(value: any, errorObj: Object): unknown {
    return value[Object.keys(errorObj)[0]];
  }

}