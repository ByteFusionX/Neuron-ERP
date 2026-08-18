import { ErrorHandler, Injectable } from '@angular/core';

export type DiagnosticEntryLevel = 'error' | 'warn' | 'uncaught' | 'unhandledrejection';

export interface DiagnosticEntry {
  level: DiagnosticEntryLevel;
  message: string;
  stack?: string;
  timestamp: number;
}

const BUFFER_LIMIT = 50;
const NETWORK_BODY_TRUNCATE_LENGTH = 500;

export interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  body: string;
  timestamp: number;
}

/**
 * In-memory ring buffer of recent console.error/warn calls, uncaught
 * errors, and failed HTTP requests, for attaching to bug reports (Phase 1,
 * Steps 2-3). Never persisted; cleared on page reload. Wrapping happens
 * once, in the constructor, so simply injecting this service (e.g. via the
 * ErrorHandler provider below) is enough to start capturing.
 */
@Injectable({ providedIn: 'root' })
export class DiagnosticsBufferService {
  private readonly buffer: DiagnosticEntry[] = [];
  private readonly networkBuffer: NetworkErrorEntry[] = [];
  private wrapped = false;

  constructor() {
    this.wrapConsole();
    this.wrapGlobalHandlers();
  }

  getEntries(): DiagnosticEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer.length = 0;
    this.networkBuffer.length = 0;
  }

  getNetworkErrors(): NetworkErrorEntry[] {
    return [...this.networkBuffer];
  }

  pushNetworkError(entry: NetworkErrorEntry): void {
    this.networkBuffer.push({
      ...entry,
      body: entry.body.length > NETWORK_BODY_TRUNCATE_LENGTH
        ? `${entry.body.slice(0, NETWORK_BODY_TRUNCATE_LENGTH)}…`
        : entry.body,
    });
    if (this.networkBuffer.length > BUFFER_LIMIT) {
      this.networkBuffer.shift();
    }
  }

  private push(entry: DiagnosticEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > BUFFER_LIMIT) {
      this.buffer.shift();
    }
  }

  private wrapConsole(): void {
    if (this.wrapped) {
      return;
    }
    this.wrapped = true;

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      this.push({ level: 'error', message: stringifyArgs(args), timestamp: Date.now() });
      originalError(...args);
    };

    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      this.push({ level: 'warn', message: stringifyArgs(args), timestamp: Date.now() });
      originalWarn(...args);
    };
  }

  private wrapGlobalHandlers(): void {
    window.addEventListener('error', (event: ErrorEvent) => {
      this.push({
        level: 'uncaught',
        message: event.message,
        stack: event.error?.stack,
        timestamp: Date.now(),
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      this.push({
        level: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        timestamp: Date.now(),
      });
    });
  }
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack ?? ''}` : safeStringify(arg)))
    .join(' ');
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Routes Angular's uncaught errors into the same buffer as console/window
 * errors, while preserving the default behavior of logging to console.
 */
@Injectable()
export class DiagnosticsErrorHandler implements ErrorHandler {
  constructor(private readonly diagnosticsBuffer: DiagnosticsBufferService) {}

  handleError(error: unknown): void {
    console.error(error);
  }
}
