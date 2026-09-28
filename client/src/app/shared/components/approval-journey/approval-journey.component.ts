import { Component, Input } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { ApprovalJourneyStage } from './approval-journey.model';

@Component({
  selector: 'app-approval-journey',
  standalone: true,
  imports: [NgIf, NgFor, NgClass],
  templateUrl: './approval-journey.component.html',
  styleUrl: './approval-journey.component.css',
})
export class ApprovalJourneyComponent {
  @Input() stages: ApprovalJourneyStage[] = [];
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';
  @Input() rejectionNote: string | null = 'A rejection at any stage ends the request — it does not continue down the route.';

  readonly variantClasses: Record<ApprovalJourneyStage['variant'], string> = {
    start: 'bg-sky-100 text-sky-600 ring-sky-50 dark:bg-sky-500/20 dark:text-sky-300 dark:ring-sky-500/5',
    manager: 'bg-amber-100 text-amber-600 ring-amber-50 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/5',
    stage: 'bg-violet-600 text-white ring-violet-50 dark:ring-violet-500/10',
    empty: 'border-2 border-dashed border-gray-300 text-gray-400 dark:border-gray-600',
    end: 'bg-green-100 text-green-600 ring-green-50 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-500/5',
    done: 'bg-green-600 text-white ring-green-50 dark:ring-green-500/10',
    current: 'bg-amber-500 text-white ring-amber-50 dark:ring-amber-500/10',
  };

  isMuted(stage: ApprovalJourneyStage): boolean {
    return stage.variant === 'empty';
  }
}
