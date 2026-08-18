import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export type ActionTrailEventType = 'click' | 'navigation';

export interface ActionTrailEntry {
  type: ActionTrailEventType;
  label: string;
  route: string;
  timestamp: number;
}

const TRAIL_LIMIT = 20;
const LABEL_MAX_LENGTH = 60;

/**
 * Rolling trail of the last ~20 clicks and route changes, for attaching to
 * bug reports (Phase 1, Step 4). Deliberately app-wide and always-on, so
 * each entry is kept tiny (a label/selector, not the DOM subtree) to keep
 * the capturing-phase click listener cheap for every user on every click.
 */
@Injectable({ providedIn: 'root' })
export class ActionTrailService {
  private readonly trail: ActionTrailEntry[] = [];

  constructor(private readonly router: Router) {
    this.wrapClickListener();
    this.wrapNavigation();
  }

  getTrail(): ActionTrailEntry[] {
    return [...this.trail];
  }

  clear(): void {
    this.trail.length = 0;
  }

  private push(entry: ActionTrailEntry): void {
    this.trail.push(entry);
    if (this.trail.length > TRAIL_LIMIT) {
      this.trail.shift();
    }
  }

  private wrapClickListener(): void {
    document.addEventListener(
      'click',
      (event: MouseEvent) => {
        const target = event.target as Element | null;
        if (!target) {
          return;
        }
        this.push({
          type: 'click',
          label: labelFor(target),
          route: this.router.url,
          timestamp: Date.now(),
        });
      },
      true,
    );
  }

  private wrapNavigation(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        this.push({
          type: 'navigation',
          label: event.urlAfterRedirects,
          route: event.urlAfterRedirects,
          timestamp: Date.now(),
        });
      });
  }
}

function labelFor(target: Element): string {
  const labelled = target.closest('[data-testid], [aria-label], button, a, [role="button"]');
  const el = labelled ?? target;

  const testId = el.getAttribute('data-testid');
  if (testId) {
    return `[data-testid=${testId}]`;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  const text = el.textContent?.trim();
  if (text) {
    return truncate(text);
  }

  const id = el.id ? `#${el.id}` : '';
  const className = typeof el.className === 'string' && el.className
    ? `.${el.className.trim().split(/\s+/).join('.')}`
    : '';
  return `${el.tagName.toLowerCase()}${id}${className}`;
}

function truncate(text: string): string {
  return text.length > LABEL_MAX_LENGTH ? `${text.slice(0, LABEL_MAX_LENGTH)}…` : text;
}
