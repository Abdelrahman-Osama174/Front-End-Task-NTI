import { getCurrentUser } from "./authSession.js";
import { createCart, deleteCart, getCarts, updateCart } from "./carts.js";

const STORAGE_KEY = "northstar-shopping-state-v2";
const LEGACY_STORAGE_KEY = "northstar-shopping-state-v1";
const remoteSyncQueues = new Map();

function currentIdentity() {
  const user = getCurrentUser();
  return user
    ? String(user.id ?? user.username).trim().toLocaleLowerCase()
    : "guest";
}

function emptyState() {
  return { carts: {}, wishlists: {}, remoteCartIds: {} };
}

function validateLines(lines, label) {
  if (
    !Array.isArray(lines) ||
    lines.some(
      (line) =>
        !line ||
        typeof line.productId !== "string" ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1,
    )
  ) {
    throw new Error(`Saved ${label} data is invalid.`);
  }
}

function readState() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacy) return emptyState();
      const oldState = JSON.parse(legacy);
      const legacyCart = oldState.cart.map((line) => ({
        productId: String(line?.productId),
        quantity: line?.quantity,
      }));
      validateLines(legacyCart, "cart");
      if (
        !Array.isArray(oldState.wishlist) ||
        oldState.wishlist.some((id) => typeof id !== "string" && typeof id !== "number")
      ) {
        throw new Error("Saved wishlist data is invalid.");
      }
      const migrated = emptyState();
      migrated.carts[currentIdentity()] = legacyCart;
      migrated.wishlists[currentIdentity()] = [...new Set(oldState.wishlist.map(String))];
      writeState(migrated);
      return migrated;
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Saved ")) throw error;
    throw new Error("Shopping data is unavailable. Check this site's local storage.");
  }

  try {
    const state = JSON.parse(serialized);
    if (
      !state ||
      typeof state.carts !== "object" ||
      !state.carts ||
      Array.isArray(state.carts) ||
      typeof state.wishlists !== "object" ||
      !state.wishlists ||
      Array.isArray(state.wishlists) ||
      typeof state.remoteCartIds !== "object" ||
      !state.remoteCartIds ||
      Array.isArray(state.remoteCartIds)
    ) {
      throw new Error("Saved shopping data has an invalid structure.");
    }
    Object.values(state.carts).forEach((cart) => validateLines(cart, "cart"));
    Object.values(state.wishlists).forEach((wishlist) => {
      if (!Array.isArray(wishlist) || wishlist.some((id) => typeof id !== "string")) {
        throw new Error("Saved wishlist data is invalid.");
      }
    });
    return state;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Saved ")) throw error;
    throw new Error("Shopping data is invalid. Clear the northstar shopping storage to restart.");
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error("Could not save your cart or wishlist in this browser.");
  }
}

function currentCart(state) {
  const identity = currentIdentity();
  state.carts[identity] ||= [];
  return state.carts[identity];
}

function currentWishlist(state) {
  const identity = currentIdentity();
  state.wishlists[identity] ||= [];
  return state.wishlists[identity];
}

export function getShoppingIdentity() {
  return currentIdentity();
}

export function getCart() {
  return currentCart(readState());
}

export function getCartCount() {
  return getCart().reduce((total, item) => total + item.quantity, 0);
}

export function addToCart(productId) {
  const normalizedId = String(productId);
  const state = readState();
  const cart = currentCart(state);
  const line = cart.find((item) => item.productId === normalizedId);
  if (line) line.quantity += 1;
  else cart.push({ productId: normalizedId, quantity: 1 });
  writeState(state);
  return getCart();
}

export function changeCartQuantity(productId, delta) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Cart quantity change must be a non-zero whole number.");
  const normalizedId = String(productId);
  const state = readState();
  const cart = currentCart(state);
  const line = cart.find((item) => item.productId === normalizedId);
  if (!line) return cart;
  line.quantity += delta;
  if (line.quantity < 1) state.carts[currentIdentity()] = cart.filter((item) => item.productId !== normalizedId);
  writeState(state);
  return getCart();
}

export function removeFromCart(productId) {
  const state = readState();
  state.carts[currentIdentity()] = currentCart(state).filter((item) => item.productId !== String(productId));
  writeState(state);
  return getCart();
}

export function clearCart() {
  const state = readState();
  state.carts[currentIdentity()] = [];
  writeState(state);
}

export function clearCartAfterOrder(expectedLines) {
  const state = readState();
  const cart = currentCart(state);
  if (JSON.stringify(cart) !== JSON.stringify(expectedLines)) {
    throw new Error("Your cart changed while checkout was processing. Review the cart and try again.");
  }
  state.carts[currentIdentity()] = [];
  writeState(state);
}

export function getWishlist() {
  return currentWishlist(readState());
}

export function toggleWishlist(productId) {
  const normalizedId = String(productId);
  const state = readState();
  const wishlist = currentWishlist(state);
  const index = wishlist.indexOf(normalizedId);
  if (index === -1) wishlist.push(normalizedId);
  else wishlist.splice(index, 1);
  writeState(state);
  return index === -1;
}

export function removeFromWishlist(productId) {
  const state = readState();
  state.wishlists[currentIdentity()] = currentWishlist(state).filter((id) => id !== String(productId));
  writeState(state);
}

export function moveWishlistItemToCart(productId) {
  const normalizedId = String(productId);
  const state = readState();
  if (!currentWishlist(state).includes(normalizedId)) return false;
  const cart = currentCart(state);
  const line = cart.find((item) => item.productId === normalizedId);
  if (line) line.quantity += 1;
  else cart.push({ productId: normalizedId, quantity: 1 });
  state.wishlists[currentIdentity()] = currentWishlist(state).filter((id) => id !== normalizedId);
  writeState(state);
  return true;
}

function sameCart(left, right) {
  return left.length === right.length && left.every(
    (line, index) => line.productId === right[index].productId && line.quantity === right[index].quantity,
  );
}

async function syncCart(identity, snapshot, user) {
  if (!user || !Number.isInteger(Number(user.id))) return;
  const state = readState();
  const remoteId = state.remoteCartIds[identity];
  if (!snapshot.length) {
    if (remoteId !== undefined) {
      await deleteCart(remoteId);
      const next = readState();
      delete next.remoteCartIds[identity];
      writeState(next);
    }
    return;
  }
  const payload = {
    userId: Number(user.id),
    date: new Date().toISOString().slice(0, 10),
    products: snapshot.map(({ productId, quantity }) => ({
      productId: Number(productId),
      quantity,
    })),
  };
  if (payload.products.some(({ productId }) => !Number.isInteger(productId))) return;
  let cartId = remoteId;
  if (cartId === undefined) {
    const remoteCarts = await getCarts();
    if (!Array.isArray(remoteCarts)) throw new Error("The API carts response was not a list.");
    cartId = remoteCarts.find((cart) => Number(cart.userId) === Number(user.id))?.id;
  }
  if (cartId === undefined) {
    const created = await createCart(payload);
    if (created?.id === undefined) throw new Error("The API did not return an ID for the mirrored cart.");
    cartId = created.id;
  } else if (snapshot.length) {
    await updateCart(cartId, payload);
  }

  const latest = readState();
  if (sameCart(currentCart(latest), snapshot)) {
    latest.remoteCartIds[identity] = cartId;
    writeState(latest);
  }
}

export function syncCurrentCartToApi() {
  const identity = currentIdentity();
  const user = getCurrentUser();
  const snapshot = getCart().map((line) => ({ ...line }));
  const previous = remoteSyncQueues.get(identity) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => syncCart(identity, snapshot, user));
  remoteSyncQueues.set(identity, next);
  return next.finally(() => {
    if (remoteSyncQueues.get(identity) === next) remoteSyncQueues.delete(identity);
  });
}
