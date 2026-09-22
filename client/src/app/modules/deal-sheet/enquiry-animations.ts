import { transition, trigger } from '@angular/animations';
import { opacityIn, opacityOut } from 'src/app/shared/animations/animations';

export const fileEnterState = trigger('fileTrigger', [
    transition(':enter', [opacityIn]),
    transition(":leave",[opacityOut])
  ])