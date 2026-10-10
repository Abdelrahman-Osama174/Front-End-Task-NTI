import { request } from "./apiClient.js";

export function getProducts(options) {
  return request("/products", options);
}

export function getProductById(id, options) {
  return request(`/products/${encodeURIComponent(id)}`, options);
}

export function createProduct(product, options = {}) {
  return request("/products", { ...options, method: "POST", body: product });
}

export function updateProduct(id, product, options = {}) {
  return request(`/products/${encodeURIComponent(id)}`, {
    ...options,
    method: "PUT",
    body: product,
  });
}

export function deleteProduct(id, options = {}) {
  return request(`/products/${encodeURIComponent(id)}`, { ...options, method: "DELETE" });
}

export function getProductCategories(options) {
  return request("/products/categories", options);
}

export function getProductsByCategory(category, options) {
  return request(`/products/category/${encodeURIComponent(category)}`, options);
}
