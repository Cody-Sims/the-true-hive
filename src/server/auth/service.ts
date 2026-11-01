import type { AdminConfig } from "../admin/config.ts";
import { createHash } from "node:crypto";

export interface VerifiedIdentity {
  uid: string;
  aud: string;
  iss: string;
  email_verified?: boolean;
  auth_time: number;
  firebase?: { sign_in_provider?: string; sign_in_second_factor?: string };
}

export interface AuthDependencies {
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
  verifySessionCookie(cookie: string): Promise<VerifiedIdentity>;
  createSessionCookie(token: string, expiresIn: number): Promise<string>;
  isMember(uid: string): Promise<boolean>;
  isSessionActive(hash: string, uid: string, now: Date): Promise<boolean>;
  saveSession(hash: string, uid: string, expiresAt: Date): Promise<void>;
  revokeSession(hash: string): Promise<void>;
}

export interface AdminIdentity {
  uid: string;
  actorId: string;
}

export class AdminAuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status = 403, code = "FORBIDDEN") {
    super("Inventory access could not be authorized.");
    this.status = status;
    this.code = code;
  }
}

export function createAdminAuth(
  config: AdminConfig,
  dependencies: AuthDependencies,
  now: () => number = Date.now,
) {
  function validate(
    identity: VerifiedIdentity,
    session: boolean,
    fresh: boolean,
    mfa: boolean,
  ) {
    if (
      !config.enabled ||
      !config.projectId ||
      !identity.uid ||
      identity.uid.length > 128 ||
      identity.aud !== config.projectId ||
      identity.iss !==
        `https://${session ? "session.firebase" : "securetoken"}.google.com/${config.projectId}` ||
      identity.email_verified !== true ||
      identity.firebase?.sign_in_provider !== "google.com" ||
      (mfa && identity.firebase.sign_in_second_factor !== "totp") ||
      !Number.isFinite(identity.auth_time) ||
      (fresh &&
        (now() / 1000 - identity.auth_time > 300 ||
          now() / 1000 < identity.auth_time))
    )
      throw new AdminAuthError();
  }
  async function verified(token: string, session = false) {
    if (!config.enabled) throw new AdminAuthError(503, "UNAVAILABLE");
    if (!token || token.length > 16384)
      throw new AdminAuthError(401, "UNAUTHORIZED");
    try {
      return await (session
        ? dependencies.verifySessionCookie(token)
        : dependencies.verifyIdToken(token));
    } catch {
      throw new AdminAuthError(401, "UNAUTHORIZED");
    }
  }
  function actor(uid: string) {
    return { uid, actorId: `fb-${hashSession(uid)}` };
  }
  return {
    async login(token: string) {
      const identity = await verified(token);
      validate(identity, false, true, true);
      if (!(await dependencies.isMember(identity.uid)))
        throw new AdminAuthError();
      const expiresIn = 8 * 60 * 60 * 1000;
      const cookie = await dependencies.createSessionCookie(token, expiresIn);
      const sessionIdentity = await verified(cookie, true);
      validate(sessionIdentity, true, true, true);
      if (sessionIdentity.uid !== identity.uid) throw new AdminAuthError();
      const expiresAt = new Date(now() + expiresIn);
      await dependencies.saveSession(
        hashSession(cookie),
        identity.uid,
        expiresAt,
      );
      return { cookie, ...actor(identity.uid), expiresAt };
    },
    async enrollment(token: string) {
      const identity = await verified(token);
      validate(identity, false, true, false);
      if (!(await dependencies.isMember(identity.uid)))
        throw new AdminAuthError();
      return { allowed: true };
    },
    async authenticate(cookie: string): Promise<AdminIdentity> {
      const identity = await verified(cookie, true);
      validate(identity, true, false, true);
      if (
        !(await dependencies.isSessionActive(
          hashSession(cookie),
          identity.uid,
          new Date(now()),
        )) ||
        !(await dependencies.isMember(identity.uid))
      )
        throw new AdminAuthError(401, "UNAUTHORIZED");
      return actor(identity.uid);
    },
    async logout(cookie: string) {
      if (!config.enabled) throw new AdminAuthError(503, "UNAVAILABLE");
      if (cookie) await dependencies.revokeSession(hashSession(cookie));
    },
  };
}

export function hashSession(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
