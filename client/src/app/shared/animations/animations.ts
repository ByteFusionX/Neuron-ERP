import { animate, animation, style, transition, trigger } from "@angular/animations";

export const opacityIn = animation([
    style({
        opacity: 0
      }),
      animate('200ms',
        style({
          opacity: 1
        })
      )
])

export const opacityOut = animation([
    animate('200ms',
        style({
          opacity: 0
        })
      )
])

export const moveDown = animation([
  style({
      transform: 'translateY(-100%)'
  }),
  animate('300ms',
      style({
          transform: 'translateY(0)'
      })
  )
])

export const moveUp = animation([
  animate('300ms',
      style({
          transform: 'translateY(0%)'
      })
  )
])

export const fadeInOut = trigger('fadeInOut', [
  transition(':enter', [
      style({ opacity: 0 }),
      animate('0.3s ease-in-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
      animate('0.3s ease-in-out', style({ opacity: 0 }))
  ])
]);