import { HttpErrorResponse } from '@angular/common/http';

export type FieldErrors = Record<string, string[]>;

export interface ApiError {
  status: number;
  code: string;
  message: string;
  fieldErrors: FieldErrors;
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: 'Failed to connect to the server. Please check your internet connection and try again.',
  400: 'The request could not be processed. Please check the details and try again.',
  401: 'Access denied. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource could not be found.',
  409: 'This action could not be completed due to a conflict with the current data.',
  422: 'Please correct the highlighted fields.',
  500: 'Something went wrong on our end. Please try again shortly.',
};

const FALLBACK_CODES: Record<number, string> = {
  0: 'NETWORK',
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  500: 'INTERNAL_ERROR',
};

/** Accepts `{a: 'msg'}`, `{a: ['m1','m2']}` or `[{field, message}]` and returns the canonical shape. */
function toFieldErrors(raw: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!raw) return out;

  if (Array.isArray(raw)) {
    for (const item of raw as any[]) {
      const field = item?.field ?? item?.path ?? item?.param;
      const msg = item?.message ?? item?.msg;
      if (field && msg) (out[field] ||= []).push(String(msg));
    }
    return out;
  }

  if (typeof raw === 'object') {
    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      const msgs = (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'string' && v) as string[];
      if (msgs.length) out[field] = msgs;
    }
  }
  return out;
}

/** Maps any thrown value (HttpErrorResponse or otherwise) to one ApiError shape. */
export function normalizeApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const status = err.status;
    const body = err.error && typeof err.error === 'object' && !(err.error instanceof ProgressEvent) ? err.error : null;

    const message =
      (body && (body.message || (typeof body.error === 'string' ? body.error : ''))) ||
      (typeof err.error === 'string' && err.error.length < 300 ? err.error : '') ||
      FALLBACK_MESSAGES[status] ||
      FALLBACK_MESSAGES[500];

    return {
      status,
      code: (body && typeof body.code === 'string' && body.code) || FALLBACK_CODES[status] || 'ERROR',
      message,
      fieldErrors: toFieldErrors(body?.fieldErrors ?? body?.errors),
    };
  }

  const message = err instanceof Error && err.message ? err.message : FALLBACK_MESSAGES[500];
  return { status: -1, code: 'CLIENT_ERROR', message, fieldErrors: {} };
}

/** True when the server rejected specific fields (422, or any status that carries fieldErrors). */
export function hasFieldErrors(e: ApiError): boolean {
  return Object.keys(e.fieldErrors).length > 0;
}
