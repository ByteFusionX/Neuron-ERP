import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { NgIconComponent } from '@ng-icons/core';

/**
 * The List | Report switch shown on a module's list and report pages. The active side is a plain
 * label; the other side links to its page. Both sides carry an icon.
 */
@Component({
  selector: 'app-view-toggle',
  standalone: true,
  imports: [RouterLink, NgIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './view-toggle.component.html',
})
export class ViewToggleComponent {
  @Input({ required: true }) active: 'list' | 'report' = 'list';
  @Input({ required: true }) listLink: string | any[] = '';
  @Input({ required: true }) reportLink: string | any[] = '';
  @Input() listQueryParams: Params | null = null;
  @Input() reportQueryParams: Params | null = null;
  @Input() label = 'View';

  readonly base = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium';
  readonly on = 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100';
  readonly off = 'text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100';
}
