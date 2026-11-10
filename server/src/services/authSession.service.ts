import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import Employee from "../models/employee.model";
import RefreshToken from "../models/refreshToken.model";
import PushSubscription from "../models/pushSubscription.model";
import { disconnectUserSockets } from "./socket-io.service";

// Session model: a short-lived access JWT {id, employeeId} (sent as Bearer, kept in localStorage as
// `employeeToken`) plus a rotating refresh token held only in an httpOnly cookie and, hashed, in Mongo.
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "1d";
// REFRESH_TOKEN_MINUTES (testing only) overrides REFRESH_TOKEN_DAYS so expiry can be exercised quickly.
const REFRESH_TTL_MS = process.env.REFRESH_TOKEN_MINUTES
  ? Number(process.env.REFRESH_TOKEN_MINUTES) * 60 * 1000
  : Number(process.env.REFRESH_TOKEN_DAYS || 7) * 24 * 60 * 60 * 1000;
// Two tabs refreshing at once both present the same cookie; the loser is not an attack.
const REUSE_GRACE_MS = 10 * 1000;

export const REFRESH_COOKIE = "erp_refresh";
// The cookie is only ever sent to the auth endpoints, never to ordinary API calls.
const COOKIE_PATH = "/employee";

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const cookieOptions = () => {
  const production = process.env.NODE_ENV === "production";
  // SameSite=None is needed only when the SPA and API are on different sites; it requires Secure.
  const sameSite = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) || (production ? "strict" : "lax");
  return {
    httpOnly: true,
    secure: production || sameSite === "none",
    sameSite,
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  };
};

export const signAccessToken = (employee: { _id: any; employeeId: string }) =>
  jwt.sign({ id: employee._id, employeeId: employee.employeeId }, process.env.JWT_SECRET as string, {
    expiresIn: ACCESS_TOKEN_TTL as any,
  });

const setRefreshCookie = (res: Response, token: string) => res.cookie(REFRESH_COOKIE, token, cookieOptions());
const clearRefreshCookie = (res: Response) => {
  const { maxAge, ...rest } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, rest);
};

const createRefreshToken = async (req: Request, employeeId: any, family: string, sessionStartedAt: Date = new Date()) => {
  const token = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    employee: employeeId,
    tokenHash: hash(token),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: req.get("user-agent")?.slice(0, 300),
    ip: req.ip,
    sessionStartedAt,
  });
  return token;
};

/** Called after a successful login (Azure, or the dev password login): sets the refresh cookie, returns the access token. */
export const startSession = async (req: Request, res: Response, employee: { _id: any; employeeId: string }) => {
  const refresh = await createRefreshToken(req, employee._id, crypto.randomUUID());
  setRefreshCookie(res, refresh);
  return signAccessToken(employee);
};

/** POST /employee/refresh: rotate the refresh token and return a new access token, or null if the session is over. */
export const refreshSession = async (req: Request, res: Response): Promise<string | null> => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) return null;

  const record = await RefreshToken.findOne({ tokenHash: hash(presented) });
  if (!record) {
    clearRefreshCookie(res);
    return null;
  }

  if (record.revokedAt) {
    const justRotated = Date.now() - record.revokedAt.getTime() < REUSE_GRACE_MS;
    if (!justRotated) {
      // An old token came back after being rotated: treat it as stolen and end the whole chain.
      await RefreshToken.updateMany({ family: record.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      clearRefreshCookie(res);
      return null;
    }
  }

  if (record.expiresAt.getTime() < Date.now()) {
    clearRefreshCookie(res);
    return null;
  }

  const employee = await Employee.findOne({ _id: record.employee, isDeleted: { $ne: true }, isBlocked: { $ne: true } }, { employeeId: 1 });
  if (!employee) {
    await RefreshToken.updateMany({ family: record.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    return null;
  }

  // Inside the grace window the winning tab already holds the new cookie: only mint an access token.
  if (!record.revokedAt) {
    // Atomic claim so two simultaneous refreshes cannot both rotate the same token.
    const claimed = await RefreshToken.findOneAndUpdate({ _id: record._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    if (claimed) {
      setRefreshCookie(res, await createRefreshToken(req, employee._id, record.family, record.sessionStartedAt ?? record.createdAt));
    }
  }
  return signAccessToken(employee as any);
};

/** POST /employee/logout: end this browser's session. */
export const endSession = async (req: Request, res: Response) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) {
    const record = await RefreshToken.findOne({ tokenHash: hash(presented) });
    if (record) {
      await RefreshToken.updateMany({ family: record.family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      await PushSubscription.deleteMany({ family: record.family });
    }
  }
  clearRefreshCookie(res);
};

/** End every session an employee has (sign out everywhere, block, delete). Their push subscriptions go with them. */
export const revokeAllSessions = async (employeeId: any) => {
  await PushSubscription.deleteMany({ employee: employeeId });
  disconnectUserSockets(employeeId);
  return RefreshToken.updateMany({ employee: employeeId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
};

// ---- Device list ----

const describeDevice = (ua = "") => {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return { browser, os, mobile: /Mobile|Android|iPhone/.test(ua) };
};

export const currentFamily = async (req: Request) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) return null;
  const record = await RefreshToken.findOne({ tokenHash: hash(presented) }, { family: 1 });
  return record?.family ?? null;
};

/** GET /employee/sessions: the employee's signed-in devices (one live row per login). */
export const listSessions = async (req: Request, employeeId: any) => {
  const [rows, current] = await Promise.all([
    RefreshToken.find({ employee: employeeId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean(),
    currentFamily(req),
  ]);
  return rows.map((r) => ({
    id: r.family,
    ...describeDevice(r.userAgent),
    ip: r.ip ?? null,
    signedInAt: r.sessionStartedAt ?? r.createdAt,
    lastActiveAt: r.createdAt,
    current: r.family === current,
  }));
};

/** DELETE /employee/sessions/:id: sign one device out. Returns false if it is not this employee's. */
export const revokeSession = async (req: Request, res: Response, employeeId: any, family: string) => {
  const result = await RefreshToken.updateMany({ employee: employeeId, family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  if (!result.matchedCount) return false;
  await PushSubscription.deleteMany({ employee: employeeId, family });
  if ((await currentFamily(req)) === family) clearRefreshCookie(res);
  return true;
};
