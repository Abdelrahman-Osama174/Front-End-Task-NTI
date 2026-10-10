import { request } from "./apiClient.js";

export function getUsers(options) {
  return request("/users", options);
}

export function getUserById(id, options) {
  return request(`/users/${encodeURIComponent(id)}`, options);
}

export function createUser(user, options = {}) {
  validateUser(user);
  return request("/users", { ...options, method: "POST", body: user });
}

export function updateUser(id, user, options = {}) {
  if (!id) throw new Error("A user ID is required.");
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("User updates must be provided as an object.");
  }
  return request(`/users/${encodeURIComponent(id)}`, {
    ...options,
    method: "PUT",
    body: user,
  });
}

export function deleteUser(id, options = {}) {
  if (!id) throw new Error("A user ID is required.");
  return request(`/users/${encodeURIComponent(id)}`, { ...options, method: "DELETE" });
}

function validateUser(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw new Error("A user profile is required.");
  }
  if (
    typeof user.username !== "string" ||
    !/^[A-Za-z0-9_.-]{3,50}$/.test(user.username.trim())
  ) {
    throw new Error("Username must contain 3–50 characters.");
  }
  if (
    typeof user.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())
  ) {
    throw new Error("Enter a valid email address.");
  }
  if (typeof user.password !== "string" || user.password.length < 8 || user.password.length > 128) {
    throw new Error("Password must contain 8–128 characters.");
  }
  if (
    typeof user.name?.firstname !== "string" ||
    user.name.firstname.trim().length < 1 ||
    user.name.firstname.trim().length > 30 ||
    typeof user.name?.lastname !== "string" ||
    user.name.lastname.trim().length < 1 ||
    user.name.lastname.trim().length > 30
  ) {
    throw new Error("First and last name are required.");
  }
  if (
    typeof user.phone !== "string" ||
    !/^[0-9+()\s-]{7,20}$/.test(user.phone.trim())
  ) {
    throw new Error("Enter a valid phone number.");
  }
  if (
    typeof user.address?.city !== "string" ||
    !user.address.city.trim() ||
    user.address.city.trim().length > 60 ||
    typeof user.address?.street !== "string" ||
    !user.address.street.trim() ||
    user.address.street.trim().length > 100
  ) {
    throw new Error("A valid city and street address are required.");
  }
}
