import { DestroyRef, inject } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiError, normalizeApiError } from '../errors/api-error';

export type SaveResult<R> =
  | { status: 'ok'; value: R }
  | { status: 'invalid' }
  | { status: 'busy' }
  | { status: 'failed'; error: ApiError };

export interface FormSaveFlowOptions {
  /** Return false when the form is not on screen, so the unload guard only protects an open form. */
  isActive?: () => boolean;
  /** Shown when client-side validation blocks the save. */
  invalidMessage?: string;
}

/**
 * One save lifecycle per form: busy gate, form.disable()/enable(), input kept on failure,
 * server field errors (422 `fieldErrors`) re-applied to the matching controls, and a
 * beforeunload guard while saving or dirty.
 *
 * Create it in a field initializer (it injects DestroyRef), after the form field:
 *   readonly saveFlow = new FormSaveFlow(this.form);
 */
export class FormSaveFlow<T extends FormGroup> {
  saving = false;
  /** Summary for the whole form: client validation, non-field server errors, or network failures. */
  error = '';

  private readonly options: FormSaveFlowOptions;

  constructor(private readonly form: T, options: FormSaveFlowOptions = {}) {
    this.options = options;
    const onUnload = (event: BeforeUnloadEvent) => {
      if (this.blocksUnload) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', onUnload));
  }

  get blocksUnload(): boolean {
    const active = this.options.isActive ? this.options.isActive() : true;
    return this.saving || (active && this.form.dirty);
  }

  /** Clears the summary; call when the form is opened, reset or closed. */
  reset(): void { this.error = ''; }

  async run<R>(save: () => Promise<R>): Promise<SaveResult<R>> {
    if (this.saving) return { status: 'busy' };
    this.error = '';
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error = this.options.invalidMessage ?? 'Review the required fields and their validation messages.';
      return { status: 'invalid' };
    }

    this.saving = true;
    this.form.disable();
    let result: SaveResult<R>;
    try {
      const value = await save();
      this.form.markAsPristine();
      result = { status: 'ok', value };
    } catch (err) {
      const error = normalizeApiError(err);
      this.error = error.message;
      result = { status: 'failed', error };
    }
    this.saving = false;
    this.form.enable();
    // enable() re-runs validation and wipes errors, so server errors go on afterwards.
    if (result.status === 'failed') this.applyFieldErrors(result.error);
    return result;
  }

  /**
   * Puts server fieldErrors on their controls (`server` error key, cleared automatically on the
   * next edit). Returns messages for fields that have no control so callers can list them.
   */
  private applyFieldErrors(error: ApiError): string[] {
    const unmapped: string[] = [];
    for (const [path, messages] of Object.entries(error.fieldErrors)) {
      const control: AbstractControl | null = this.form.get(path);
      if (control) {
        control.setErrors({ server: messages[0], ...(control.errors ?? {}) });
        control.markAsTouched();
      } else {
        unmapped.push(...messages);
      }
    }
    if (unmapped.length) this.error = [this.error, ...unmapped].filter(Boolean).join(' ');
    return unmapped;
  }
}
