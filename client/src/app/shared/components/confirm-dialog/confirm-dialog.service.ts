import { Injectable, inject } from '@angular/core';
import { ModalService } from '../modal';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmConfig, ConfirmResult } from './confirm-dialog.model';

/**
 * Opens a confirm dialog on document.body via ModalService; no template markup needed.
 *   const { confirmed, reason } = await this.confirm.open({ tone: 'reject', title: '…', message: '…', reason: true });
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private modal = inject(ModalService);
  private open$: Promise<ConfirmResult> | null = null;

  open(config: ConfirmConfig): Promise<ConfirmResult> {
    // a second request while one is showing (double click) reuses the first
    if (this.open$) return this.open$;

    this.open$ = new Promise<ConfirmResult>((resolve) => {
      this.modal.open<ConfirmResult, ConfirmConfig>(ConfirmDialogComponent, {
        data: config,
        width: '28rem',
        role: 'alertdialog',
        layer: 'confirm',
      }).afterClosed().subscribe((result) => {
        this.open$ = null;
        resolve(result ?? { confirmed: false });
      });
    });
    return this.open$;
  }
}
