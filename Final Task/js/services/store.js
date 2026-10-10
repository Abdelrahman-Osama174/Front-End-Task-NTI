const STORAGE_KEY = "northstar-store-v1";

function removeLegacyPasswords(value, markRemoved) {
  if (Array.isArray(value)) {
    return value.map((item) => removeLegacyPasswords(item, markRemoved));
  }
  if (!value || typeof value !== "object") return value;

  return Object.entries(value).reduce((sanitized, [key, item]) => {
    if (key.toLocaleLowerCase() === "password") {
      markRemoved();
      return sanitized;
    }
    sanitized[key] = removeLegacyPasswords(item, markRemoved);
    return sanitized;
  }, {});
}

export function saveStore(store, onError) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.error("Could not save the store data:", error);
    onError?.("Could not save your changes in this browser.");
    return false;
  }
}

export function loadStore() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    if (
      !parsed ||
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.products) ||
      !Array.isArray(parsed.categories) ||
      !Array.isArray(parsed.orders)
    ) {
      throw new Error("The saved store data has an invalid structure.");
    }
    parsed.carts ||= {};
    let removedPasswords = false;
    parsed.users = removeLegacyPasswords(parsed.users, () => {
      removedPasswords = true;
    });
    if (removedPasswords) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        throw new Error("Legacy plaintext passwords could not be removed from this browser's saved store.");
      }
    }
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Legacy plaintext passwords could not be removed")
    ) {
      console.error("Legacy password cleanup failed.");
      throw error;
    }
    console.error("Could not read the saved store data:", error);
    throw new Error("Saved store data is invalid. Clear this site's local storage to restart.");
  }
}
