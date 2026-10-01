import { animate, state, style, transition, trigger, useAnimation } from "@angular/animations"
import { moveDown, moveUp } from "../../animations/animations"

export const dropDownMenuSate = trigger('dropDownTrigger', [
    transition(':enter', useAnimation(moveDown)),
    transition(':leave', useAnimation(moveUp)),
])

export const buttonSlideState = trigger('slideTrigger',[
    transition('slideUp => slideDown',useAnimation(moveDown)),
    transition('slideDown => slideUp',useAnimation(moveUp)),
])

export const slideLogoState = trigger('slideLogoTrigger', [
    transition(':enter', [
        style({ transform: 'translateX({{enter}})', opacity: 0 }),
        animate('250ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
    ], { params: { enter: '0%' } }),
    transition(':leave', [
        animate('250ms ease-in', style({ transform: 'translateX({{leave}})', opacity: 0 }))
    ], { params: { leave: '0%' } }),
])
