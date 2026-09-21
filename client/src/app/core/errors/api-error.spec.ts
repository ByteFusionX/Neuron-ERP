import { HttpErrorResponse } from '@angular/common/http';
import { normalizeApiError } from './api-error';

describe('normalizeApiError', () => {
  it('maps a 422 with fieldErrors to the canonical shape', () => {
    const e = normalizeApiError(new HttpErrorResponse({
      status: 422,
      error: { code: 'VALIDATION_FAILED', message: 'Fix fields', fieldErrors: { name: ['Required'] } },
    }));
    expect(e).toEqual({ status: 422, code: 'VALIDATION_FAILED', message: 'Fix fields', fieldErrors: { name: ['Required'] } });
  });

  it('accepts legacy string and array field errors', () => {
    const e = normalizeApiError(new HttpErrorResponse({
      status: 400,
      error: { message: 'Bad', errors: [{ field: 'email', message: 'Invalid' }] },
    }));
    expect(e.fieldErrors).toEqual({ email: ['Invalid'] });
    expect(e.code).toBe('BAD_REQUEST');
  });

  it('falls back for network errors and non-HTTP errors', () => {
    expect(normalizeApiError(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK');
    expect(normalizeApiError(new Error('boom'))).toEqual({ status: -1, code: 'CLIENT_ERROR', message: 'boom', fieldErrors: {} });
  });
});
