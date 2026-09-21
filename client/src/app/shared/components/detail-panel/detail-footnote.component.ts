import { Component } from '@angular/core';

/**
 * The muted line that closes a tab — "Generated … from live project data." Content only.
 *
 *   <app-detail-footnote>Generated {{ rep.asOf | date }} from live project data.</app-detail-footnote>
 */
@Component({
  selector: 'app-detail-footnote',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [`
    :host { display: block; margin-top: 1.5rem; font-size: 0.75rem; line-height: 1rem; color: #9ca3af; }
    :host-context(html.dark) { color: #737373; }
  `],
})
export class DetailFootnoteComponent {}
