import { AUTH_CONFIG } from "../config/auth.js";

const STORAGE_KEY = "northstar-local-accounts-v1";
const HASH_BYTES = 32;
const ITERATIONS = 210000;
const encoder = new TextEncoder();

function normalizeEmail(email) {
  return String(email || "").trim().toLocaleLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readAccounts() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Saved accounts are unavailable in this browser.");
  }
  if (!serialized) return [];
  try {
    const accounts = JSON.parse(serialized);
    if (
      !Array.isArray(accounts) ||
      accounts.some(
        (account) =>
          !account ||
          typeof account.id !== "string" ||
          typeof account.email !== "string" ||
          !validEmail(account.email) ||
          typeof account.name !== "string" ||
          typeof account.passwordSalt !== "string" ||
          typeof account.passwordHash !== "string" ||
          !Number.isInteger(account.iterations) ||
          account.iterations < 100000 ||
          account.iterations > 1000000 ||
          account.role !== "customer",
      )
    ) {
      throw new Error("Invalid account data.");
    }
    return accounts;
  } catch {
    throw new Error(`Saved accounts are invalid. Clear the ${STORAGE_KEY} entry to restart.`);
  }
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error("Could not save your account in this browser.");
  }
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function derivePasswordHash(password, salt, iterations) {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Secure browser password hashing is unavailable. Open the app on localhost or HTTPS.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function hashesMatch(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function publicAccount(account) {
  return {
    id: account.id,
    username: account.email,
    email: account.email,
    name: account.name,
    role: "customer",
  };
}

export function getLocalRegisteredUsers() {
  return readAccounts().map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    createdAt: account.createdAt,
  }));
}

export function validateAccountInput({ email, firstName, lastName, password, phone, city, street }) {
  const normalizedEmail = normalizeEmail(email);
  if (!validEmail(normalizedEmail) || normalizedEmail.length > 120) {
    throw new Error("Enter a valid email address.");
  }
  if (
    typeof firstName !== "string" ||
    firstName.trim().length < 1 ||
    firstName.trim().length > 30 ||
    typeof lastName !== "string" ||
    lastName.trim().length < 1 ||
    lastName.trim().length > 30
  ) {
    throw new Error("First and last name must each contain 1–30 characters.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Password must contain 8–128 characters.");
  }
  if (typeof phone !== "string" || !/^[0-9+()\s-]{7,20}$/.test(phone.trim())) {
    throw new Error("Enter a valid phone number.");
  }
  if (
    typeof city !== "string" ||
    city.trim().length < 1 ||
    city.trim().length > 60 ||
    typeof street !== "string" ||
    street.trim().length < 1 ||
    street.trim().length > 100
  ) {
    throw new Error("Enter a valid city and street address.");
  }
  return normalizedEmail;
}

export async function registerLocalAccount(accountInput) {
  const email = validateAccountInput(accountInput);
  if (email === normalizeEmail(AUTH_CONFIG.demoAdmin.email)) {
    throw new Error("That email is reserved for the demo administrator.");
  }
  const accounts = readAccounts();
  if (accounts.some((account) => normalizeEmail(account.email) === email)) {
    throw new Error("An account with this email already exists in this browser.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePasswordHash(accountInput.password, salt, ITERATIONS);
  const account = {
    id: `local-${crypto.randomUUID()}`,
    email,
    name: `${accountInput.firstName.trim()} ${accountInput.lastName.trim()}`,
    phone: accountInput.phone.trim(),
    city: accountInput.city.trim(),
    street: accountInput.street.trim(),
    passwordSalt: encodeBase64(salt),
    passwordHash: encodeBase64(passwordHash),
    iterations: ITERATIONS,
    role: "customer",
    createdAt: new Date().toISOString(),
  };
  saveAccounts([account, ...accounts]);
  return publicAccount(account);
}

export async function authenticateLocalAccount(emailInput, password) {
  const email = normalizeEmail(emailInput);
  const admin = AUTH_CONFIG.demoAdmin;
  if (email === normalizeEmail(admin.email)) {
    if (typeof password !== "string" || password.length > 128) {
      throw new Error("Email or password is incorrect.");
    }
    const actualHash = await derivePasswordHash(
      password,
      decodeBase64(admin.salt),
      admin.iterations,
    );
    if (!hashesMatch(actualHash, decodeBase64(admin.passwordHash))) {
      throw new Error("Email or password is incorrect.");
    }
    return {
      id: admin.id,
      username: admin.email,
      email: admin.email,
      name: admin.name,
      role: "admin",
    };
  }

  const account = readAccounts().find(
    (candidate) => normalizeEmail(candidate.email) === email,
  );
  if (!account) return null;
  if (typeof password !== "string" || password.length > 128) {
    throw new Error("Email or password is incorrect.");
  }
  const actualHash = await derivePasswordHash(
    password,
    decodeBase64(account.passwordSalt),
    account.iterations,
  );
  if (!hashesMatch(actualHash, decodeBase64(account.passwordHash))) {
    throw new Error("Email or password is incorrect.");
  }
  return publicAccount(account);
}
