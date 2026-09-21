import { InjectionToken } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export const MODAL_DATA = new InjectionToken<unknown>('MODAL_DATA');

export interface ModalConfig<D = unknown> {
  data?: D;
  /** CSS max-width of the panel, e.g. '640px'. */
  width?: string;
  /** Close when the backdrop is clicked. Defaults to true. */
  closeOnBackdrop?: boolean;
  /** 'alertdialog' for confirm-style dialogs that demand an explicit choice. Defaults to 'dialog'. */
  role?: 'dialog' | 'alertdialog';
  /** 'confirm' stacks above a regular modal and skips the backdrop blur. Defaults to 'default'. */
  layer?: 'default' | 'confirm';
}

/** Injected into the component rendered inside a modal; use it to close with a result. */
export class ModalRef<R = unknown> {
  private readonly closed$ = new Subject<R | undefined>();
  /** @internal */
  requestClose: (result?: R) => void = () => {};

  close(result?: R): void {
    this.requestClose(result);
  }

  afterClosed(): Observable<R | undefined> {
    return this.closed$.asObservable();
  }

  /** @internal */
  notifyClosed(result?: R): void {
    this.closed$.next(result);
    this.closed$.complete();
  }
}
