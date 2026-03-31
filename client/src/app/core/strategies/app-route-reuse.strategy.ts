import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';
import { SameRouteNavigationService } from '../services/same-route-navigation.service';

@Injectable()
export class AppRouteReuseStrategy implements RouteReuseStrategy {
  private sameRoute = inject(SameRouteNavigationService);

  shouldDetach(): boolean {
    return false;
  }

  store(): void {}

  shouldAttach(): boolean {
    return false;
  }

  retrieve(): DetachedRouteHandle | null {
    return null;
  }

  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    if (this.sameRoute.shouldBypassRouteReuse()) {
      return false;
    }
    return future.routeConfig === curr.routeConfig;
  }
}
