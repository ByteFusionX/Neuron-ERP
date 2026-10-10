import { Component, HostListener, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { AlertItem, AlertService, AlertType } from 'src/app/core/services/alert.service';

const ICONS: Record<AlertType, string> = {
  success: 'heroCheckCircle',
  info: 'heroInformationCircle',
  warning: 'heroExclamationTriangle',
  error: 'heroXCircle',
};

/** chip = icon background, bar = timer + left accent. */
const TONES: Record<AlertType, { chip: string; bar: string }> = {
  success: { chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400', bar: 'bg-emerald-500' },
  info: { chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400', bar: 'bg-sky-500' },
  warning: { chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400', bar: 'bg-amber-500' },
  error: { chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400', bar: 'bg-rose-500' },
};

@Component({
  selector: 'app-alert-host',
  templateUrl: './alert-host.component.html',
  styleUrls: ['./alert-host.component.css'],
  imports: [NgClass, IconsModule],
})
export class AlertHostComponent {
  readonly alerts = inject(AlertService);
  readonly icons = ICONS;
  readonly tones = TONES;
  readonly paused = new Set<number>();

  onTimerEnd(alert: AlertItem) {
    this.alerts.expire(alert.id);
  }

  @HostListener('document:keydown.escape')
  closeLatest() {
    const latest = this.alerts.messages().at(-1);
    if (latest) this.alerts.dismiss(latest.id);
  }
}
