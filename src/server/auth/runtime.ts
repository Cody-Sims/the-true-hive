import { readAdminConfig } from "../admin/config.ts";
import { getAdminPool } from "../admin/pool.ts";
import { createAdminPersistence } from "./persistence.ts";
import { createAdminAuth } from "./service.ts";
import { createAdminBoundary } from "./http.ts";

let boundary: ReturnType<typeof createAdminBoundary> | undefined;

export function getAdminBoundary() {
  if (boundary) return boundary;
  const config = readAdminConfig();
  async function firebase() {
    const { getAdminFirebase } = await import("./firebase.ts");
    return getAdminFirebase(config);
  }
  // All provider/pool access remains lazy: the disabled showcase has neither.
  const auth = createAdminAuth(config, {
    verifyIdToken: async (token) =>
      (await firebase()).verifyIdToken(token, true),
    verifySessionCookie: async (cookie) =>
      (await firebase()).verifySessionCookie(cookie, true),
    createSessionCookie: async (token, expiresIn) =>
      (await firebase()).createSessionCookie(token, { expiresIn }),
    isMember: (uid) =>
      createAdminPersistence(getAdminPool(config)).isMember(uid),
    isSessionActive: (hash, uid, now) =>
      createAdminPersistence(getAdminPool(config)).isSessionActive(
        hash,
        uid,
        now,
      ),
    saveSession: (hash, uid, expiry) =>
      createAdminPersistence(getAdminPool(config)).saveSession(
        hash,
        uid,
        expiry,
      ),
    revokeSession: (hash) =>
      createAdminPersistence(getAdminPool(config)).revokeSession(hash),
  });
  boundary = createAdminBoundary(config, auth);
  return boundary;
}
