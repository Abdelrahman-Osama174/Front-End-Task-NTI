import { getOrders, getOrderById } from "./orders.js";
import { getCurrentUser } from "./authSession.js";

const STORAGE_KEY = "northstar-return-requests-v1";
export const RETURN_WINDOW_DAYS = 14;
const ACTIVE_STATUSES = new Set(["Requested", "Approved"]);

function readReturns() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Return history is unavailable in this browser.");
  }
  if (!serialized) return [];
  try {
    const requests = JSON.parse(serialized);
    if (
      !Array.isArray(requests) ||
      requests.some(
        (item) =>
          !item ||
          typeof item.id !== "string" ||
          typeof item.orderId !== "string" ||
          typeof item.customerId !== "string" ||
          typeof item.customerName !== "string" ||
          typeof item.customerEmail !== "string" ||
          typeof item.productId !== "string" ||
          typeof item.productName !== "string" ||
          typeof item.reason !== "string" ||
          item.reason.length < 5 ||
          item.reason.length > 500 ||
          !["Requested", "Approved", "Rejected"].includes(item.status) ||
          typeof item.requestedAt !== "string" ||
          !Number.isFinite(Date.parse(item.requestedAt)) ||
          (item.decidedAt !== null && !Number.isFinite(Date.parse(item.decidedAt))) ||
          typeof item.adminNote !== "string" ||
          item.adminNote.length > 300
      )
    ) {
      throw new Error("Invalid return data.");
    }
    return requests;
  } catch {
    throw new Error("Saved return data is invalid. Clear the northstar-return-requests-v1 entry to restart.");
  }
}

function saveReturns(requests) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    throw new Error("Could not save the return request in this browser.");
  }
}

export function getReturnRequests() {
  return readReturns().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function getReturnRequestsForCustomer(customerId) {
  const normalizedId = String(customerId);
  return getReturnRequests().filter((request) => request.customerId === normalizedId);
}

export function isOrderReturnEligible(order, now = Date.now()) {
  if (!order || order.status !== "Confirmed") return false;
  const confirmedAt = Date.parse(order.timestamps?.confirmedAt || "");
  if (!Number.isFinite(confirmedAt)) return false;
  const age = now - confirmedAt;
  return age >= 0 && age <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function createReturnRequest({ orderId, productId, customerId, reason }) {
  const user = getCurrentUser();
  if (
    user?.role !== "customer" ||
    String(user.id ?? user.username) !== String(customerId)
  ) {
    throw new Error("Only the current customer can request a return for their own order.");
  }
  const normalizedReason = String(reason || "").trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) {
    throw new Error("Return reason must contain 5–500 characters.");
  }
  const order = getOrderById(orderId);
  if (!order || order.customerId !== String(customerId)) {
    throw new Error("That order does not belong to the current customer.");
  }
  if (!isOrderReturnEligible(order)) {
    throw new Error(`Returns are limited to confirmed orders within ${RETURN_WINDOW_DAYS} days of confirmation.`);
  }
  const item = order.items.find((line) => line.productId === String(productId));
  if (!item) throw new Error("That product is not part of this order.");
  const requests = readReturns();
  const duplicate = requests.some(
    (request) =>
      request.orderId === order.id &&
      request.productId === item.productId &&
      ACTIVE_STATUSES.has(request.status),
  );
  if (duplicate) throw new Error("An active return request already exists for this order item.");

  const request = {
    id: `RT-${crypto.randomUUID()}`,
    orderId: order.id,
    customerId: order.customerId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    productId: item.productId,
    productName: item.name,
    reason: normalizedReason,
    status: "Requested",
    requestedAt: new Date().toISOString(),
    decidedAt: null,
    adminNote: "",
  };
  saveReturns([request, ...requests]);
  return request;
}

export function decideReturnRequest(requestId, decision, adminNote = "") {
  if (getCurrentUser()?.role !== "admin") {
    throw new Error("Administrator access is required to decide return requests.");
  }
  if (!["Approved", "Rejected"].includes(decision)) {
    throw new Error("Choose whether to approve or reject this return request.");
  }
  const note = String(adminNote || "").trim();
  if (note.length > 300) throw new Error("Admin notes may contain at most 300 characters.");
  const requests = readReturns();
  const request = requests.find((item) => item.id === String(requestId));
  if (!request) throw new Error("That return request could not be found.");
  if (request.status !== "Requested") {
    throw new Error(`This return request has already been ${request.status.toLowerCase()}.`);
  }
  request.status = decision;
  request.decidedAt = new Date().toISOString();
  request.adminNote = note;
  saveReturns(requests);
  return request;
}

export function getOrdersWithReturnsForCustomer(customerId) {
  const requests = getReturnRequestsForCustomer(customerId);
  return getOrders().filter((order) => order.customerId === String(customerId)).map((order) => ({
    ...order,
    returns: requests.filter((request) => request.orderId === order.id),
  }));
}
