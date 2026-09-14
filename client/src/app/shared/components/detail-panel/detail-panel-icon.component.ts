import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

const PATHS: Record<string, string> = {
  info: 'M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  chat: 'M8 10h8M8 14h5m-9 6l2.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14z',
  files: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zm0 0v5h5',
  activity: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  tasks: 'M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  wallet: 'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14V9H5a2 2 0 01-2-2zm13 6h.01',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0',
  users: 'M17 20a5 5 0 00-10 0M12 11a3 3 0 100-6 3 3 0 000 6zm7 9a4 4 0 00-3-3.9M17 5a3 3 0 010 6',
  mail: 'M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zm0-8a3 3 0 100-6 3 3 0 000 6z',
  calendar: 'M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  tag: 'M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9zm5-4h.01',
  building: 'M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M8 7h4M8 11h4M8 15h4M2 21h20',
  refresh: 'M4 4v6h6M20 20v-6h-6M5.5 15A7 7 0 0018 17.5M18.5 9A7 7 0 006 6.5',
  card: 'M3 9h18M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  plus: 'M12 5v14M5 12h14',
  note: 'M12 8v8m-4-4h8M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  copy: 'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  pause: 'M10 9v6m4-6v6M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  trash: 'M4 7h16M10 11v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M4 19h16',
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  sort: 'M3 6h11M3 12h7M3 18h4M17 5v14m0 0l-3-3m3 3l3-3',
  density: 'M4 5h16M4 9.67h16M4 14.33h16M4 19h16',
  grip:'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
};

/** Small stroke icon set used by the detail panel and its consumers. Unknown names render nothing. */
@Component({
  selector: 'app-dp-icon',
  standalone: true,
  imports: [CommonModule],
  template: `<svg *ngIf="path" [attr.class]="size" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="path" /></svg>`,
  styles: [':host{display:inline-flex;flex-shrink:0}'],
})
export class DetailPanelIconComponent {
  @Input() name = '';
  @Input() size = 'w-4 h-4';

  get path(): string | undefined {
    return PATHS[this.name];
  }
}
