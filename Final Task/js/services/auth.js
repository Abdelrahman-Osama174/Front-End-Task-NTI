import { request } from "./apiClient.js";

export function login(credentials, options = {}) {
  const username = String(credentials?.username || "").trim();
  const password = credentials?.password;
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    throw new Error("Enter a valid username.");
  }
  if (typeof password !== "string" || !password.length || password.length > 128) {
    throw new Error("Enter a valid password.");
  }
  return request("/auth/login", {
    ...options,
    method: "POST",
    body: { username, password },
  });
}
