import { ApplicationRef, Injectable, createComponent, inject } from '@angular/core';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmConfig, ConfirmResult } from './confirm-dialog.model';

/**
 * Opens a confirm dialog on document.body; no template markup needed.
 *   const { confirmed, reason } = await this.confirm.open({ tone: 'reject', title: '…', message: '…', reason: true });
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private appRef = inject(ApplicationRef);
  private open$: Promise<ConfirmResult> | null = null;

  open(config: ConfirmConfig): Promise<ConfirmResult> {
    // a second request while one is showing (double click) reuses the first
    if (this.open$) return this.open$;
    const ref = createComponent(ConfirmDialogComponent, { environmentInjector: this.appRef.injector });
    ref.setInput('config', config);
    document.body.appendChild(ref.location.nativeElement);
    this.appRef.attachView(ref.hostView);

    this.open$ = new Promise<ConfirmResult>((resolve) => {
      ref.instance.closed.subscribe((result) => {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        this.open$ = null;
        resolve(result);
      });
    });
    return this.open$;
  }
}
