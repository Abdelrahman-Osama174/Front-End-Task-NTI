import { request } from "./apiClient.js";

export function getCarts(options) {
  return request("/carts", options);
}

export function getCartById(id, options) {
  return request(`/carts/${encodeURIComponent(id)}`, options);
}

export function createCart(cart, options = {}) {
  return request("/carts", { ...options, method: "POST", body: cart });
}

export function updateCart(id, cart, options = {}) {
  return request(`/carts/${encodeURIComponent(id)}`, {
    ...options,
    method: "PUT",
    body: cart,
  });
}

export function deleteCart(id, options = {}) {
  return request(`/carts/${encodeURIComponent(id)}`, { ...options, method: "DELETE" });
}
