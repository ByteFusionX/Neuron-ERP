import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SameRouteNavigationService {
  private bypassReuseUntilNavigationSettles = false;

  beginSameUrlTargetReload(): void {
    this.bypassReuseUntilNavigationSettles = true;
  }

  shouldBypassRouteReuse(): boolean {
    return this.bypassReuseUntilNavigationSettles;
  }

  endSameUrlNavigationCycle(): void {
    this.bypassReuseUntilNavigationSettles = false;
  }
}
