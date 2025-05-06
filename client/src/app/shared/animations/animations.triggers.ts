import { transition, trigger } from '@angular/animations';
import { moveDown, moveUp, opacityIn, opacityOut } from './animations';

export const opacityState = trigger('opacityTrigger', [
    transition(':enter', [opacityIn]),
    transition(":leave",[opacityOut])
  ])

  export const transformState = trigger('transformTrigger',[
    transition(':enter',[moveDown]),
    transition(':leave',[moveUp])
  ])