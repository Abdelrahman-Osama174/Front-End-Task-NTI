import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductCategories,
  getProducts,
  getProductsByCategory as getProductsInCategory,
  updateProduct,
} from "./products.js";

const STORAGE_KEY = "northstar-managed-store-v1";

function readState() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Product management data is unavailable in this browser.");
  }
  if (!serialized) return { overrides: {}, created: [], deleted: [], categories: [] };
  try {
    const state = JSON.parse(serialized);
    if (
      !state ||
      !state.overrides ||
      typeof state.overrides !== "object" ||
      Array.isArray(state.overrides) ||
      !Array.isArray(state.created) ||
      !Array.isArray(state.deleted) ||
      !Array.isArray(state.categories) ||
      state.deleted.some((id) => typeof id !== "string") ||
      state.categories.some((name) => typeof name !== "string" || !name.trim()) ||
      state.created.some(
        (product) =>
          !product ||
          typeof product !== "object" ||
          product.id === undefined ||
          typeof product.title !== "string" ||
          typeof product.category !== "string" ||
          typeof product.description !== "string" ||
          typeof product.image !== "string" ||
          !Number.isFinite(product.price),
      ) ||
      Object.values(state.overrides).some(
        (product) => !product || typeof product !== "object" || Array.isArray(product),
      )
    ) {
      throw new Error("Invalid management data.");
    }
    return state;
  } catch {
    throw new Error("Saved product management data is invalid. Clear the northstar-managed-store-v1 entry to restart.");
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error("Could not save product management changes in this browser.");
  }
}

function normalizeProduct(product) {
  return {
    ...product,
    id: String(product.id),
    title: String(product.title || product.name || ""),
    stock: Number.isInteger(product.stock) && product.stock >= 0 ? product.stock : null,
    source: product.source || "api",
  };
}

function validateRemoteProduct(product) {
  if (
    !product ||
    typeof product !== "object" ||
    Array.isArray(product) ||
    product.id === undefined ||
    product.id === null ||
    typeof product.title !== "string" ||
    typeof product.price !== "number" ||
    !Number.isFinite(product.price) ||
    product.price <= 0 ||
    typeof product.description !== "string" ||
    typeof product.category !== "string" ||
    typeof product.image !== "string"
  ) {
    throw new Error("The Fake Store API returned an invalid product record.");
  }
}

function mergeProducts(remoteProducts, state) {
  remoteProducts.forEach(validateRemoteProduct);
  const deletedIds = new Set(state.deleted.map(String));
  const products = remoteProducts
    .filter((product) => !deletedIds.has(String(product.id)))
    .map((product) => normalizeProduct({ ...product, ...state.overrides[String(product.id)] }));
  const existingIds = new Set(products.map((product) => String(product.id)));
  state.created.forEach((product) => {
    if (!deletedIds.has(String(product.id)) && !existingIds.has(String(product.id))) {
      products.push(normalizeProduct(product));
    }
  });
  return products;
}

function toApiProduct(product) {
  return {
    title: product.title,
    price: product.price,
    description: product.description,
    image: product.image,
    category: product.category,
  };
}

export async function getManagedProducts(options) {
  const remoteProducts = await getProducts(options);
  if (!Array.isArray(remoteProducts)) throw new Error("The products response was not a list.");
  return mergeProducts(remoteProducts, readState());
}

export async function getManagedProductsByCategory(category, options) {
  const remoteProducts = await getProductsInCategory(category, options);
  if (!Array.isArray(remoteProducts)) {
    throw new Error("The category products response was not a list.");
  }
  const state = readState();
  const deletedIds = new Set(state.deleted.map(String));
  const products = mergeProducts(remoteProducts, state).filter(
    (product) => product.category === category,
  );
  const includedIds = new Set(products.map((product) => String(product.id)));

  Object.entries(state.overrides).forEach(([id, product]) => {
    if (
      product.category === category &&
      !deletedIds.has(String(id)) &&
      !includedIds.has(String(id))
    ) {
      products.push(normalizeProduct({ ...product, id, source: "api" }));
    }
  });
  return products;
}

export async function getManagedProductById(id, options) {
  const state = readState();
  const normalizedId = String(id);
  if (state.deleted.includes(normalizedId)) throw new Error("That product is no longer available.");
  const created = state.created.find((product) => String(product.id) === normalizedId);
  if (created) return normalizeProduct(created);
  const remoteProduct = await getProductById(id, options);
  validateRemoteProduct(remoteProduct);
  return normalizeProduct({
    ...remoteProduct,
    ...state.overrides[normalizedId],
  });
}

export async function getManagedCategories(options) {
  const apiCategories = await getProductCategories(options);
  if (!Array.isArray(apiCategories) || apiCategories.some((name) => typeof name !== "string")) {
    throw new Error("The product categories response was not a valid list.");
  }
  const state = readState();
  const apiNames = new Set(apiCategories.map((name) => name.toLocaleLowerCase()));
  return [
    ...apiCategories.map((name) => ({ name, source: "api" })),
    ...state.categories
      .filter((name) => !apiNames.has(name.toLocaleLowerCase()))
      .map((name) => ({ name, source: "local" })),
  ];
}

export async function createManagedProduct(product, options) {
  const currentProducts = await getManagedProducts(options);
  const state = readState();
  const response = await createProduct(toApiProduct(product), options);
  if (!response || typeof response !== "object" || Array.isArray(response) || response.id === undefined) {
    throw new Error("The Fake Store API did not return a product ID.");
  }
  if (currentProducts.some((item) => String(item.id) === String(response.id))) {
    throw new Error("The Fake Store API returned an ID that is already in use; the demo product could not be added safely.");
  }
  const created = normalizeProduct({ ...product, id: response.id, source: "local" });
  state.created = [
    created,
    ...state.created.filter((item) => String(item.id) !== created.id),
  ];
  delete state.overrides[created.id];
  state.deleted = state.deleted.filter((id) => String(id) !== created.id);
  writeState(state);
  return created;
}

export async function updateManagedProduct(id, product, options) {
  const state = readState();
  const normalizedId = String(id);
  const createdIndex = state.created.findIndex((item) => String(item.id) === normalizedId);
  await updateProduct(id, toApiProduct(product), options);
  if (createdIndex >= 0) {
    const updated = normalizeProduct({ ...product, id: normalizedId, source: "local" });
    state.created[createdIndex] = updated;
    writeState(state);
    return updated;
  }
  const updated = normalizeProduct({ ...product, id: normalizedId });
  state.overrides[normalizedId] = updated;
  writeState(state);
  return updated;
}

export async function deleteManagedProduct(id, options) {
  const state = readState();
  const normalizedId = String(id);
  const createdIndex = state.created.findIndex((item) => String(item.id) === normalizedId);
  await deleteProduct(id, options);
  if (createdIndex >= 0) {
    state.created.splice(createdIndex, 1);
    state.deleted = [...new Set([...state.deleted, normalizedId])];
    writeState(state);
    return { id: normalizedId, wasCreatedLocally: true };
  }
  delete state.overrides[normalizedId];
  state.deleted = [...new Set([...state.deleted, normalizedId])];
  writeState(state);
  return { id: normalizedId, wasCreatedLocally: false };
}

export function addCustomCategory(name) {
  const state = readState();
  state.categories.push(name);
  writeState(state);
}

export function renameCustomCategory(oldName, newName) {
  const state = readState();
  const index = state.categories.findIndex((name) => name === oldName);
  if (index < 0) throw new Error("Only locally managed custom categories can be renamed.");
  state.categories[index] = newName;
  state.created.forEach((product) => {
    if (product.category === oldName) product.category = newName;
  });
  Object.entries(state.overrides).forEach(([id, product]) => {
    if (product.category === oldName) state.overrides[id] = { ...product, category: newName };
  });
  writeState(state);
}

export function deleteCustomCategory(name) {
  const state = readState();
  const index = state.categories.findIndex((category) => category === name);
  if (index < 0) throw new Error("Only locally managed custom categories can be deleted.");
  state.categories.splice(index, 1);
  writeState(state);
}
