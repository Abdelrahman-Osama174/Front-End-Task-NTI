export const AUTH_CONFIG = Object.freeze({
  sessionDurationMs: 8 * 60 * 60 * 1000,
  adminUsernames: [],
  demoAdmin: Object.freeze({
    id: "northstar-demo-admin",
    email: "admin@northstar.demo",
    name: "Northstar Admin",
    salt: "KEsruOpl6h/ncXWb7Q0L6g==",
    passwordHash: "5o9xzqJtVzliPQzwqVKkwMCgnDFTVuF74jqf2wCqyM8=",
    iterations: 210000,
  }),
});
