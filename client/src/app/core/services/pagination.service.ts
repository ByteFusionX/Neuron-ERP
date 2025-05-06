import { Injectable, signal, WritableSignal } from '@angular/core';

export interface PaginationState {
  page: number;
  row: number;
  total:number;
}

@Injectable()
export class PaginationService {
  private _paginationState: WritableSignal<PaginationState> = signal({ page: 1, row: 10, total:50 });
  readonly paginationState = this._paginationState.asReadonly();

  constructor() { }

  updatePaginationState(newState: PaginationState): void {
    this._paginationState.set(newState);
  }
}