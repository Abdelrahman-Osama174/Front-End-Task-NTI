const STORAGE_KEY = "northstar-orders-v1";
const ORDER_STATUSES = new Set(["Pending", "Confirmed", "Rejected"]);
const PAYMENT_STATUSES = new Set(["Unpaid", "Pending", "Paid", "Failed", "Cancelled"]);

function validateOrder(order) {
  return Boolean(
    order &&
    typeof order.id === "string" &&
    typeof order.customerId === "string" &&
    typeof order.customerEmail === "string" &&
    typeof order.customerName === "string" &&
    Array.isArray(order.items) &&
    order.items.length > 0 &&
    order.items.every(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.price) &&
        item.price >= 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.subtotal) &&
        item.subtotal === item.price * item.quantity,
    ) &&
    Number.isFinite(order.total) &&
    order.total >= 0 &&
    typeof order.createdAt === "string" &&
    Number.isFinite(Date.parse(order.createdAt)) &&
    ORDER_STATUSES.has(order.status) &&
    PAYMENT_STATUSES.has(order.paymentStatus) &&
    Array.isArray(order.paymentAttempts) &&
    order.paymentAttempts.every(
      (attempt) =>
        attempt &&
        typeof attempt.paypalOrderId === "string" &&
        ["Created", "Completed", "Failed", "Cancelled"].includes(attempt.status) &&
        typeof attempt.createdAt === "string" &&
        Number.isFinite(Date.parse(attempt.createdAt)) &&
        (attempt.completedAt === null || Number.isFinite(Date.parse(attempt.completedAt))) &&
        (attempt.captureId === null || typeof attempt.captureId === "string"),
    ) &&
    order.deliveryInfo &&
    typeof order.deliveryInfo === "object" &&
    typeof order.deliveryInfo.name === "string" &&
    typeof order.deliveryInfo.phone === "string" &&
    typeof order.deliveryInfo.address === "string" &&
    typeof order.deliveryInfo.city === "string" &&
    typeof order.deliveryInfo.postalCode === "string" &&
    order.timestamps &&
    typeof order.timestamps === "object"
  );
}

function readOrders() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Local order history is unavailable in this browser.");
  }
  if (!serialized) return [];
  try {
    const orders = JSON.parse(serialized);
    orders.forEach((order) => {
      if (order && !("paymentAttempts" in order)) order.paymentAttempts = [];
      if (order && !("paymentStatus" in order)) order.paymentStatus = "Unpaid";
      if (order?.deliveryInfo && !("name" in order.deliveryInfo)) {
        order.deliveryInfo.name = order.customerName || "";
      }
    });
    if (!Array.isArray(orders) || orders.some((order) => !validateOrder(order))) {
      throw new Error("Saved order data has an invalid structure.");
    }
    return orders;
  } catch {
    throw new Error("Saved order data is invalid. Clear the northstar-orders-v1 entry to restart.");
  }
}

function writeOrders(orders) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  } catch {
    throw new Error("Could not save the order in this browser. Your cart has not been cleared.");
  }
}

export function createOrder({
  customer,
  items,
  deliveryInfo,
  paymentStatus = "Unpaid",
}) {
  if (!customer || customer.id === undefined || !customer.email || !customer.name) {
    throw new Error("A valid customer profile is required to place an order.");
  }
  if (!Array.isArray(items) || !items.length) throw new Error("Cannot create an order with an empty cart.");
  if (!PAYMENT_STATUSES.has(paymentStatus)) throw new Error("The order payment status is invalid.");
  const createdAt = new Date().toISOString();
  const orderItems = items.map((item) => ({
    productId: String(item.productId),
    name: String(item.name),
    price: Number(item.price),
    quantity: Number(item.quantity),
    image: String(item.image || ""),
    subtotal: Number(item.price) * Number(item.quantity),
  }));
  if (
    orderItems.some(
      (item) =>
        !item.productId ||
        !item.name ||
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1,
    )
  ) {
    throw new Error("The cart contains invalid order items.");
  }
  if (
    !deliveryInfo ||
    typeof deliveryInfo.name !== "string" ||
    typeof deliveryInfo.phone !== "string" ||
    typeof deliveryInfo.address !== "string" ||
    typeof deliveryInfo.city !== "string" ||
    typeof deliveryInfo.postalCode !== "string" ||
    !deliveryInfo.phone.trim() ||
    !deliveryInfo.name.trim() ||
    !deliveryInfo.address.trim() ||
    !deliveryInfo.city.trim() ||
    !deliveryInfo.postalCode.trim()
  ) {
    throw new Error("Complete all required delivery details.");
  }

  const orders = readOrders();
  const order = {
    id: `NS-${crypto.randomUUID()}`,
    customerId: String(customer.id),
    customerEmail: String(customer.email),
    customerName: String(customer.name),
    items: orderItems,
    total: orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    createdAt,
    status: "Pending",
    paymentStatus,
    paymentAttempts: [],
    deliveryInfo: {
      phone: deliveryInfo.phone.trim(),
      name: deliveryInfo.name.trim(),
      address: deliveryInfo.address.trim(),
      city: deliveryInfo.city.trim(),
      postalCode: deliveryInfo.postalCode.trim(),
    },
    timestamps: {
      createdAt,
      updatedAt: createdAt,
      confirmedAt: null,
      rejectedAt: null,
    },
  };
  writeOrders([order, ...orders]);
  return order;
}

export function getOrders() {
  return readOrders();
}

export function getOrdersForCustomer(customerId) {
  const normalizedId = String(customerId);
  return readOrders().filter((order) => order.customerId === normalizedId);
}

export function getOrderById(orderId) {
  return readOrders().find((order) => order.id === String(orderId)) || null;
}

export function updateOrderStatus(orderId, nextStatus) {
  if (!["Confirmed", "Rejected"].includes(nextStatus)) {
    throw new Error("Orders can only be confirmed or rejected by the admin demo.");
  }
  const orders = readOrders();
  const order = orders.find((item) => item.id === String(orderId));
  if (!order) throw new Error("That order could not be found.");
  if (order.status !== "Pending") {
    throw new Error(`Cannot change an order from ${order.status} to ${nextStatus}.`);
  }
  const now = new Date().toISOString();
  order.status = nextStatus;
  order.timestamps.updatedAt = now;
  order.timestamps[`${nextStatus.toLocaleLowerCase()}At`] = now;
  writeOrders(orders);
  return order;
}

export function startPayPalAttempt(orderId, paypalOrderId) {
  if (typeof paypalOrderId !== "string" || !paypalOrderId.trim()) {
    throw new Error("PayPal did not return a valid order reference.");
  }
  const orders = readOrders();
  const order = orders.find((item) => item.id === String(orderId));
  if (!order) throw new Error("That local order could not be found.");
  if (order.paymentStatus === "Paid") throw new Error("This order has already been paid.");
  if (order.paymentAttempts.some((attempt) => attempt.paypalOrderId === paypalOrderId)) {
    throw new Error("This PayPal payment attempt is already associated with the order.");
  }
  const activeAttempt = order.paymentAttempts.find((attempt) => attempt.status === "Created");
  if (activeAttempt) throw new Error("A PayPal payment attempt is already in progress for this order.");
  order.paymentStatus = "Pending";
  order.paymentAttempts.push({
    paypalOrderId,
    status: "Created",
    createdAt: new Date().toISOString(),
    completedAt: null,
    captureId: null,
  });
  writeOrders(orders);
  return order.paymentAttempts.at(-1);
}

export function finishPayPalAttempt(orderId, paypalOrderId, status) {
  if (!["Failed", "Cancelled"].includes(status)) {
    throw new Error("PayPal attempt can only be marked failed or cancelled here.");
  }
  const orders = readOrders();
  const order = orders.find((item) => item.id === String(orderId));
  const attempt = order?.paymentAttempts.find((item) => item.paypalOrderId === paypalOrderId);
  if (!order || !attempt) throw new Error("The PayPal attempt is not associated with this order.");
  if (attempt.status !== "Created") return attempt;
  attempt.status = status;
  attempt.completedAt = new Date().toISOString();
  order.paymentStatus = order.paymentAttempts.some((item) => item.status === "Created")
    ? "Pending"
    : status;
  writeOrders(orders);
  return attempt;
}

export function completePayPalCapture(orderId, paypalOrderId, capture) {
  if (
    !capture ||
    capture.status !== "COMPLETED" ||
    typeof capture.id !== "string" ||
    !capture.id.trim()
  ) {
    throw new Error("PayPal did not confirm a completed capture. The order remains unpaid.");
  }
  const orders = readOrders();
  const order = orders.find((item) => item.id === String(orderId));
  const attempt = order?.paymentAttempts.find((item) => item.paypalOrderId === paypalOrderId);
  if (!order || !attempt) throw new Error("The PayPal capture is not associated with this order.");
  if (attempt.status !== "Created") {
    if (attempt.status === "Completed" && attempt.captureId === capture.id) return order;
    throw new Error("This PayPal payment attempt is no longer active.");
  }
  attempt.status = "Completed";
  attempt.completedAt = new Date().toISOString();
  attempt.captureId = capture.id;
  order.paymentStatus = "Paid";
  writeOrders(orders);
  return order;
}
