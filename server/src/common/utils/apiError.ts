import { NextFunction, Request, Response } from "express";

// Wire shape for every error the API returns. The client's normalizeApiError maps it 1:1.
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

const DEFAULT_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "VALIDATION_FAILED",
  500: "INTERNAL_ERROR",
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = DEFAULT_CODES[status] || "ERROR",
    public fieldErrors?: Record<string, string[]>
  ) {
    super(message);
  }

  static validation(fieldErrors: Record<string, string[]>, message = "Please correct the highlighted fields.") {
    return new ApiError(422, message, "VALIDATION_FAILED", fieldErrors);
  }
}

export function sendError(res: Response, status: number, message: string, code?: string, fieldErrors?: Record<string, string[]>) {
  const body: ApiErrorBody = { code: code || DEFAULT_CODES[status] || "ERROR", message };
  if (fieldErrors && Object.keys(fieldErrors).length) body.fieldErrors = fieldErrors;
  return res.status(status).json(body);
}

// Registered after all routers. Converts thrown/next()'d errors into the ApiErrorBody shape.
export function apiErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return sendError(res, err.status, err.message, err.code, err.fieldErrors);
  }

  // Mongoose schema validation -> 422 with per-field messages
  if (err?.name === "ValidationError" && err.errors) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [path, e] of Object.entries<any>(err.errors)) {
      (fieldErrors[path] ||= []).push(e?.message || "Invalid value");
    }
    return sendError(res, 422, "Please correct the highlighted fields.", "VALIDATION_FAILED", fieldErrors);
  }

  // Mongoose stale document (optimistic concurrency, roadmap #19)
  if (err?.name === "VersionError") {
    return sendError(res, 409, "This record was changed by someone else. Reload to see the latest version.", "STALE_VERSION");
  }

  if (err?.name === "CastError") {
    return sendError(res, 400, `Invalid value for ${err.path}.`, "BAD_REQUEST", { [err.path]: ["Invalid value"] });
  }

  if (err?.code === 11000) {
    const fields = Object.keys(err.keyPattern || {});
    const fieldErrors: Record<string, string[]> = {};
    fields.forEach((f) => (fieldErrors[f] = ["Already exists"]));
    return sendError(res, 409, "A record with the same value already exists.", "DUPLICATE", fieldErrors);
  }

  console.error(err);
  return sendError(res, 500, "Something went wrong on our end. Please try again shortly.");
}
