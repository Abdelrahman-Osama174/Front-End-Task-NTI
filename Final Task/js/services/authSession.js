import { AUTH_CONFIG } from "../config/auth.js";

const SESSION_KEY = "northstar-auth-session-v1";
const VALID_ROLES = new Set(["admin", "customer"]);

export function createSession(token, user) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("The authentication service did not return a valid session token.");
  }
  if (
    !user ||
    (typeof user.username !== "string" && typeof user.email !== "string") ||
    !VALID_ROLES.has(user.role)
  ) {
    throw new Error("The authenticated user profile is invalid.");
  }

  const username = user.username || user.email;
  const session = {
    token,
    user: {
      id: user.id ?? null,
      username,
      name: user.name || username,
      email: user.email || "",
      role: isConfiguredAdmin(username, user.email) ? "admin" : "customer",
    },
    expiresAt: Date.now() + AUTH_CONFIG.sessionDurationMs,
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    throw new Error("Your browser could not save the sign-in session. Check its session storage settings.");
  }
  return session.user;
}

function getCurrentSession() {
  let serialized;
  try {
    serialized = sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!serialized) return null;

  try {
    const session = JSON.parse(serialized);
    const valid =
      typeof session?.token === "string" &&
      session.token.length > 0 &&
      typeof session.expiresAt === "number" &&
      session.expiresAt > Date.now() &&
      typeof session.user?.username === "string" &&
      VALID_ROLES.has(session.user.role);
    if (valid) {
      session.user.role = isConfiguredAdmin(session.user.username, session.user.email)
        ? "admin"
        : "customer";
      return session;
    }
  } catch {
    // Invalid session data is discarded below.
  }

  clearSession();
  return null;
}

export function getCurrentUser() {
  return getCurrentSession()?.user || null;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    throw new Error("Your browser could not clear the sign-in session.");
  }
}

export function isConfiguredAdmin(username, email) {
  const identifiers = [username, email]
    .filter(Boolean)
    .map((value) => String(value).trim().toLocaleLowerCase());
  return identifiers.includes(String(AUTH_CONFIG.demoAdmin.email).trim().toLocaleLowerCase()) ||
    AUTH_CONFIG.adminUsernames.some((adminUsername) =>
      identifiers.includes(String(adminUsername).trim().toLocaleLowerCase()),
    );
}
