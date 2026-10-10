import { loadStore, saveStore } from "./services/store.js";
import { login } from "./services/auth.js";
import { createSession, clearSession, getCurrentUser, isConfiguredAdmin } from "./services/authSession.js";
import { authenticateLocalAccount, registerLocalAccount } from "./services/localAccounts.js";
import { getUsers } from "./services/users.js";
import {
  clearCartAfterOrder,
  getCart,
  getCartCount,
  syncCurrentCartToApi,
} from "./services/shoppingState.js";
import {
  completePayPalCapture,
  createOrder,
  finishPayPalAttempt,
  getOrderById,
  getOrdersForCustomer,
  startPayPalAttempt,
  updateOrderStatus,
} from "./services/orders.js";
import { PAYPAL_CONFIG } from "./config/paypal.js";
import { isPayPalConfigured, loadPayPalSdk } from "./services/paypal.js";
import { submitProductReview } from "./services/reviews.js";
import {
  createReturnRequest,
  getReturnRequestsForCustomer,
  isOrderReturnEligible,
  RETURN_WINDOW_DAYS,
} from "./services/returns.js";
import { getManagedProductById } from "./services/managedStore.js";
import { handleAdminAction, handleAdminFormSubmit, renderAdminPanel } from "./pages/admin.js";
import {
  handleShoppingAction,
  loadMoreProducts,
  renderCart as renderShoppingCart,
  renderHome,
  renderProductDetails,
  renderProducts,
  renderWishlist as renderShoppingWishlist,
  refreshCatalogData,
  updateProductListing,
} from "./pages/catalog.js";
import {
  formatPrice,
  makeActionButton,
  makeElement,
} from "./utils/dom.js";

const appContent = document.getElementById("app-content");
const noticeElement = document.getElementById("notice");
let store;
let activeView = "home";
let adminTab = "products";
let noticeTimer;
let selectedCategory = "";
let selectedProductId = null;
let pageRenderVersion = 0;
let checkoutOrderId = null;
let selectedReturnItem = null;

const starterCategories = [
  "Clothing",
  "Home",
  "Accessories",
  "Wellness",
];

const starterProducts = [
  {
    id: "p-101",
    name: "Everyday Canvas Tote",
    image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80",
    category: "Accessories",
    price: 24.5,
    description: "A sturdy, roomy canvas carryall made for market mornings and busy days.",
    stock: 18,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-102",
    name: "Soft Knit Sweater",
    image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80",
    category: "Clothing",
    price: 68,
    description: "An easy-to-layer knit with a relaxed shape and a soft, everyday feel.",
    stock: 12,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-103",
    name: "Stoneware Coffee Cup",
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80",
    category: "Home",
    price: 19,
    description: "Hand-finished stoneware for slow mornings and your favorite coffee.",
    stock: 26,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-104",
    name: "Daily Face Serum",
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80",
    category: "Wellness",
    price: 32,
    description: "A lightweight hydrating serum that fits right into your daily routine.",
    stock: 9,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-105",
    name: "Minimal Leather Wallet",
    image: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=80",
    category: "Accessories",
    price: 39,
    description: "A slim wallet with thoughtful pockets for the cards you use most.",
    stock: 14,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-106",
    name: "Linen Table Runner",
    image: "https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=900&q=80",
    category: "Home",
    price: 27.5,
    description: "Natural linen texture brings a relaxed, welcoming feel to the table.",
    stock: 7,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-107",
    name: "Relaxed Cotton Shirt",
    image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=80",
    category: "Clothing",
    price: 54,
    description: "A breathable cotton button-up, cut for an easy fit from weekday to weekend.",
    stock: 16,
    ratingTotal: 0,
    ratingCount: 0,
  },
  {
    id: "p-108",
    name: "Botanical Hand Soap",
    image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=900&q=80",
    category: "Wellness",
    price: 14,
    description: "A gentle, plant-inspired hand wash with a fresh, clean scent.",
    stock: 30,
    ratingTotal: 0,
    ratingCount: 0,
  },
];

function showNotice(message, isError = false) {
  clearTimeout(noticeTimer);
  noticeElement.textContent = message;
  noticeElement.classList.toggle("error", isError);
  noticeElement.classList.remove("hidden");
  noticeTimer = setTimeout(() => noticeElement.classList.add("hidden"), 4500);
}

function persistStore() {
  return saveStore(store, (message) => showNotice(message, true));
}

async function initializeStore() {
  store = loadStore();
  if (!store) {
    store = {
      users: [],
      products: starterProducts,
      categories: starterCategories,
      orders: [],
      carts: {},
      currentUserEmail: null,
    };
    persistStore();
  }
  updateHeader();
  render();
}

function currentUser() {
  return getCurrentUser();
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function updateHeader() {
  const user = currentUser();
  const accountActions = document.getElementById("account-actions");
  accountActions.replaceChildren();

  if (user) {
    accountActions.append(
      makeElement("span", "account-name", user.name || user.username),
      makeActionButton("Log out", "logout", "button button-quiet button-small"),
    );
  } else {
    accountActions.append(
      makeActionButton("Log in", "login", "button button-quiet"),
      makeActionButton("Create account", "register", "button button-dark"),
    );
  }

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin());
  });
  document.querySelectorAll(".customer-only").forEach((element) => {
    element.classList.toggle("hidden", !user || user.role !== "customer");
  });
  document.querySelectorAll(".guest-only").forEach((element) => {
    element.classList.toggle("hidden", Boolean(user));
  });

  document.getElementById("cart-count").textContent = getCartCount();
}

function setActiveNav() {
  document.querySelectorAll(".main-nav [data-action]").forEach((button) => {
    const target = button.dataset.action;
    button.classList.toggle(
      "active",
      (activeView === "home" && target === "home") ||
        (activeView === "products" && target === "products") ||
        (activeView === "product-details" && target === "products") ||
        (activeView === target) ||
        (activeView === "login" && target === "login") ||
        (activeView === "register" && target === "register"),
    );
  });
}

function render() {
  pageRenderVersion += 1;
  updateHeader();
  setActiveNav();
  switch (activeView) {
    case "login":
    case "register":
      renderAuth(activeView);
      break;
    case "products":
      renderAsyncPage(renderProducts, selectedCategory);
      break;
    case "product-details":
      renderAsyncPage(renderProductDetails, selectedProductId);
      break;
    case "wishlist":
      renderAsyncPage(renderShoppingWishlist);
      break;
    case "cart":
      renderAsyncPage(renderShoppingCart);
      break;
    case "checkout":
      renderAsyncPage(renderCheckout);
      break;
    case "orders":
      renderOrders();
      break;
    case "admin":
      if (!isAdmin()) {
        activeView = currentUser() ? "home" : "login";
        render();
        showNotice("Administrator access is required.", true);
        break;
      }
      renderAsyncPage(renderAdminPanel, adminTab, store);
      break;
    case "home":
      renderAsyncPage(renderHome);
      break;
    default:
      activeView = "home";
      renderAsyncPage(renderHome);
  }
}

function renderAsyncPage(renderer, ...args) {
  const renderVersion = ++pageRenderVersion;
  const isCurrent = () => renderVersion === pageRenderVersion;
  let rendering;
  try {
    rendering = renderer(appContent, ...args, isCurrent);
  } catch (error) {
    rendering = Promise.reject(error);
  }
  Promise.resolve(rendering).catch((error) => {
    if (!isCurrent()) return;
    console.error("Could not render catalog page:", error);
    appContent.replaceChildren(
      emptyState("This page could not be loaded", error.message || "Please try again.", "retry-catalog", "Try again"),
    );
  });
}

function emptyState(title, description, action, label) {
  const section = makeElement("section", "empty-state");
  section.append(
    makeElement("h2", "", title),
    makeElement("p", "", description),
  );
  if (action) section.appendChild(makeActionButton(label, action, "button button-dark"));
  return section;
}

function renderAuth(mode) {
  const isRegister = mode === "register";
  appContent.innerHTML = `
    <section class="auth-wrap">
      <div class="auth-card">
        <p class="eyebrow">${isRegister ? "Join northstar" : "Welcome back"}</p>
        <h1>${isRegister ? "Create your account" : "Log in"}</h1>
        <p>${isRegister ? "Create an account for this browser. Your password is stored only as a salted hash." : "Sign in with your email address and password."}</p>
        <form id="auth-form" novalidate>
          ${isRegister ? `
            <div class="form-grid">
              <div class="field"><label for="auth-firstname">First name</label><input id="auth-firstname" name="firstname" autocomplete="given-name" required minlength="1" maxlength="30" /></div>
              <div class="field"><label for="auth-lastname">Last name</label><input id="auth-lastname" name="lastname" autocomplete="family-name" required minlength="1" maxlength="30" /></div>
            </div>
            <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="120" /></div>
            <div class="field"><label for="auth-phone">Phone number</label><input id="auth-phone" name="phone" type="tel" autocomplete="tel" required minlength="7" maxlength="20" pattern="[0-9+\\(\\)\\s\\-]+" /></div>
            <div class="form-grid">
              <div class="field"><label for="auth-city">City</label><input id="auth-city" name="city" autocomplete="address-level2" required maxlength="60" /></div>
              <div class="field"><label for="auth-street">Street address</label><input id="auth-street" name="street" autocomplete="street-address" required maxlength="100" /></div>
            </div>
            <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" /></div>
            <div class="field"><label for="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="128" /></div>
            <p class="product-meta">Use at least 8 characters. The account stays in this browser and is available again after you return on this device.</p>
          ` : `
            <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="120" /></div>
            <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required maxlength="128" /></div>
          `}
          <div class="form-actions"><button class="button button-dark" type="submit">${isRegister ? "Create account" : "Log in"}</button></div>
        </form>
        <p class="auth-switch">${isRegister ? "Already have an account?" : "New to northstar?"} <button class="text-button" data-action="${isRegister ? "login" : "register"}" type="button">${isRegister ? "Log in" : "Create an account"}</button></p>
      </div>
    </section>`;
}

function requireCustomer() {
  const user = currentUser();
  if (user?.role !== "customer") {
    activeView = user ? "home" : "login";
    render();
    showNotice(user ? "This page is available to customer accounts only." : "Log in with a customer account to continue.", true);
    return null;
  }
  return user;
}

function pageHeading(title, subtitle) {
  const heading = makeElement("div", "page-heading");
  const copy = makeElement("div");
  copy.append(
    makeElement("p", "eyebrow", "Your northstar account"),
    makeElement("h1", "", title),
    makeElement("p", "", subtitle),
  );
  heading.appendChild(copy);
  return heading;
}

function orderStatusBadge(status) {
  const badge = makeElement("span", `order-status-badge status-${status.toLocaleLowerCase()}`, status);
  badge.setAttribute("aria-label", `Order status: ${status}`);
  return badge;
}

async function renderCheckout(container = appContent, isCurrent = () => true) {
  const user = requireCustomer();
  if (!user) return;
  if (checkoutOrderId) {
    let order;
    try {
      order = getOrderById(checkoutOrderId);
    } catch (error) {
      container.replaceChildren(emptyState("Payment step unavailable", error.message || "The saved order could not be loaded."));
      return;
    }
    if (!order || order.customerId !== String(user.id ?? user.username)) {
      checkoutOrderId = null;
    } else {
      await renderPaymentStep(container, order, isCurrent);
      return;
    }
  }
  const lines = getCart();
  if (!lines.length) {
    activeView = "cart";
    render();
    showNotice("Add a product to your bag before checkout.", true);
    return;
  }
  container.replaceChildren(pageHeading("Checkout", "Review your items and delivery information."));
  const layout = makeElement("div", "checkout-layout");
  const formCard = makeElement("section", "auth-card checkout-card");
  formCard.append(
    makeElement("p", "eyebrow", "Almost yours"),
    makeElement("h2", "", "Delivery details"),
    makeElement("p", "", "Your order and payment status are stored only in this browser."),
  );
  const form = document.createElement("form");
  form.id = "checkout-form";
  form.noValidate = true;
  const fields = [
    ["name", "Full name", "text", user.name || "", 2, 60, "name"],
    ["email", "Contact email", "email", user.email || "", 0, 120, "email"],
    ["phone", "Phone number", "tel", "", 7, 20, "tel"],
    ["address", "Street address", "text", "", 5, 240, "street-address"],
    ["city", "City", "text", "", 2, 60, "address-level2"],
    ["postalCode", "Postal code", "text", "", 3, 20, "postal-code"],
  ];
  fields.forEach(([name, labelText, type, value, minLength, maxLength, autocomplete]) => {
    const field = makeElement("div", "field");
    const label = makeElement("label", "", labelText);
    label.htmlFor = `delivery-${name}`;
    const input = document.createElement("input");
    Object.assign(input, {
      id: `delivery-${name}`,
      name,
      type,
      value,
      required: name !== "email",
      readOnly: name === "email",
      minLength,
      maxLength,
      autocomplete,
    });
    if (name === "email") input.required = false;
    field.append(label, input);
    form.appendChild(field);
  });
  const formActions = makeElement("div", "form-actions");
  const submit = makeElement("button", "button button-dark", "Place order");
  submit.type = "submit";
  formActions.append(submit, makeActionButton("Back to bag", "cart", "button button-quiet"));
  form.appendChild(formActions);
  formCard.appendChild(form);

  const summary = makeElement("aside", "checkout-summary");
  summary.appendChild(makeElement("h2", "", "Order summary"));
  const snapshot = lines.map((line) => ({ ...line }));
  const results = await Promise.allSettled(snapshot.map((line) => getManagedProductById(line.productId)));
  if (!isCurrent()) return;
  let total = 0;
  let hasUnavailableProducts = false;
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      hasUnavailableProducts = true;
      summary.appendChild(makeElement("p", "alert alert-warning", `Product ${snapshot[index].productId} could not be loaded.`));
      return;
    }
    const product = result.value;
    const lineTotal = Number(product.price) * snapshot[index].quantity;
    total += lineTotal;
    summary.appendChild(makeElement("p", "checkout-summary-line", `${snapshot[index].quantity} × ${product.title} · ${formatPrice(lineTotal)}`));
  });
  summary.appendChild(makeElement("strong", "checkout-summary-total", `Total · ${formatPrice(total)}`));
  if (hasUnavailableProducts) {
    submit.disabled = true;
    summary.appendChild(makeElement("p", "text-danger", "Checkout is unavailable until all products can be loaded."));
  }
  layout.append(formCard, summary);
  container.appendChild(layout);
}

async function renderPaymentStep(container, order, isCurrent) {
  container.replaceChildren(pageHeading("Payment", "Your local order is saved. Complete a Sandbox payment or continue with an unpaid demo order."));
  const panel = makeElement("section", "payment-panel");
  panel.appendChild(makeActionButton("Continue to order history", "finish-checkout", "button button-quiet"));
  container.appendChild(panel);
  panel.append(
    makeElement("h2", "", `Order ${order.id}`),
    makeElement("p", "", `Order total: ${formatPrice(order.total)} · Payment status: ${order.paymentStatus}`),
  );
  if (!isPayPalConfigured()) {
    panel.appendChild(makeElement(
      "p",
      "alert alert-info",
      "PayPal Sandbox is not configured. Add your sandbox client ID in js/config/paypal.js; this order will remain unpaid.",
    ));
  } else if (order.paymentStatus === "Paid") {
    panel.appendChild(makeElement("p", "alert alert-success", "PayPal Sandbox confirmed a completed capture for this order."));
  } else {
    panel.append(
      makeElement("p", "small text-secondary", "Sandbox only. Client-side capture is not secure production payment verification."),
      makeElement("div", "paypal-status", "Loading PayPal Sandbox…"),
    );
    const buttonsHost = makeElement("div", "paypal-buttons");
    buttonsHost.id = "paypal-buttons";
    panel.appendChild(buttonsHost);
    try {
      const paypal = await loadPayPalSdk();
      if (!isCurrent() || !buttonsHost.isConnected) return;
      const status = panel.querySelector(".paypal-status");
      status.textContent = "";
      let activePaypalOrderId = null;
      const buttons = paypal.Buttons({
        createOrder: async (_data, actions) => {
          if (getOrderById(order.id)?.paymentStatus === "Paid") {
            throw new Error("This order has already been paid.");
          }
          const paypalOrderId = await actions.order.create({
            purchase_units: [{
              reference_id: order.id,
              description: `Northstar demo order ${order.id}`,
              amount: {
                currency_code: PAYPAL_CONFIG.currency,
                value: Number(order.total).toFixed(2),
              },
            }],
          });
          startPayPalAttempt(order.id, paypalOrderId);
          activePaypalOrderId = paypalOrderId;
          return paypalOrderId;
        },
        onApprove: async (data, actions) => {
          try {
            const result = await actions.order.capture();
            const capture = validatePayPalCapture(result, data.orderID, order);
            completePayPalCapture(order.id, data.orderID, capture);
            checkoutOrderId = null;
            activeView = "orders";
            render();
            showNotice("PayPal Sandbox capture completed. The local order payment status is Paid.");
          } catch (error) {
            let paymentRecordError = "";
            if (activePaypalOrderId) {
              try {
                finishPayPalAttempt(order.id, activePaypalOrderId, "Failed");
              } catch (recordError) {
                paymentRecordError = ` The attempt status could not be saved: ${recordError.message}`;
              }
            }
            showNotice(`${error.message || "PayPal could not confirm payment. The order remains unpaid."}${paymentRecordError}`, true);
            render();
          }
        },
        onCancel: (data) => {
          if (data.orderID) {
            try {
              finishPayPalAttempt(order.id, data.orderID, "Cancelled");
            } catch (error) {
              showNotice(error.message || "Could not record PayPal cancellation.", true);
              return;
            }
          }
          showNotice("PayPal payment was cancelled. The order remains unpaid.", true);
          render();
        },
        onError: (error) => {
          if (activePaypalOrderId) {
            try {
              finishPayPalAttempt(order.id, activePaypalOrderId, "Failed");
            } catch (recordError) {
              showNotice(recordError.message || "Could not record the PayPal error.", true);
              return;
            }
          }
          const message = error instanceof Error ? error.message : "PayPal Sandbox encountered an error.";
          showNotice(`${message} The order remains unpaid.`, true);
        },
      });
      if (!buttons.isEligible || buttons.isEligible()) await buttons.render(buttonsHost);
      else status.textContent = "PayPal is not available for this browser or account.";
    } catch (error) {
      const status = panel.querySelector(".paypal-status");
      if (status) {
        status.textContent = error.message || "PayPal Sandbox could not be loaded.";
        status.classList.add("text-danger");
      }
    }
  }
}

function validatePayPalCapture(result, paypalOrderId, order) {
  if (!result || result.id !== paypalOrderId || !Array.isArray(result.purchase_units)) {
    throw new Error("PayPal returned a capture response that could not be matched to this order.");
  }
  const purchaseUnit = result.purchase_units.find((unit) => unit.reference_id === order.id);
  const capture = purchaseUnit?.payments?.captures?.find((item) => item.status === "COMPLETED");
  if (
    !purchaseUnit ||
    purchaseUnit.amount?.currency_code !== PAYPAL_CONFIG.currency ||
    purchaseUnit.amount?.value !== Number(order.total).toFixed(2) ||
    !capture
  ) {
    throw new Error("PayPal did not confirm a completed capture for the expected order amount.");
  }
  return capture;
}

function renderOrders() {
  const user = requireCustomer();
  if (!user) return;
  appContent.replaceChildren();
  appContent.appendChild(pageHeading("Your orders", "View status and delivery details for orders saved on this device."));
  let orders;
  try {
    orders = getOrdersForCustomer(user.id ?? user.username);
  } catch (error) {
    appContent.appendChild(emptyState("Order history unavailable", error.message || "Saved orders could not be loaded."));
    return;
  }
  let returns;
  try {
    returns = getReturnRequestsForCustomer(user.id ?? user.username);
  } catch (error) {
    appContent.appendChild(emptyState("Return history unavailable", error.message || "Saved return requests could not be loaded."));
    return;
  }
  if (!orders.length) {
    appContent.appendChild(emptyState("No orders yet", "Your order history will appear here.", "home", "Browse products"));
    return;
  }
  const list = makeElement("section", "order-list");
  orders.forEach((order) => {
    const card = makeElement("article", `order-card status-${order.status.toLocaleLowerCase()}`);
    const header = makeElement("div", "order-card-header");
    const title = makeElement("div", "order-heading-copy");
    title.append(
      makeElement("h2", "", `Order ${order.id}`),
      makeElement("p", "order-date", `Placed ${new Date(order.createdAt).toLocaleString()}`),
    );
    header.append(title, orderStatusBadge(order.status));
    card.appendChild(header);
    order.items.forEach((item) => {
      const line = makeElement("div", "order-item-return");
      line.appendChild(makeElement("p", "", `${item.quantity} × ${item.name} — ${formatPrice(item.price * item.quantity)}`));
      const itemReturns = returns.filter(
        (request) => request.orderId === order.id && request.productId === item.productId,
      );
      itemReturns.forEach((request) => {
        line.appendChild(makeElement(
          "p",
          "return-status",
          `Return ${request.status} · requested ${new Date(request.requestedAt).toLocaleDateString()} · Reason: ${request.reason}${request.decidedAt ? ` · decided ${new Date(request.decidedAt).toLocaleDateString()}` : ""}${request.adminNote ? ` · Admin note: ${request.adminNote}` : ""}`,
        ));
      });
      const hasActiveRequest = itemReturns.some((request) => ["Requested", "Approved"].includes(request.status));
      if (isOrderReturnEligible(order) && !hasActiveRequest) {
        const key = `${order.id}:${item.productId}`;
        line.appendChild(makeActionButton("Request return", "show-return-form", "button button-quiet button-small", key));
        if (selectedReturnItem === key) {
          const form = document.createElement("form");
          form.id = "return-request-form";
          form.dataset.orderId = order.id;
          form.dataset.productId = item.productId;
          const label = makeElement("label", "", "Return reason");
          label.htmlFor = `return-reason-${item.productId}`;
          const textarea = document.createElement("textarea");
          textarea.id = `return-reason-${item.productId}`;
          textarea.name = "reason";
          textarea.className = "form-control";
          textarea.required = true;
          textarea.minLength = 5;
          textarea.maxLength = 500;
          textarea.rows = 3;
          const submit = makeElement("button", "button button-dark button-small", "Submit return request");
          submit.type = "submit";
          form.append(label, textarea, submit, makeActionButton("Cancel", "cancel-return-form", "button button-quiet button-small"));
          line.appendChild(form);
        }
      }
      card.appendChild(line);
    });
    card.appendChild(makeElement(
      "p",
      "demo-policy-note",
      `Demo return policy: requests are allowed within ${RETURN_WINDOW_DAYS} days after order confirmation.`,
    ));
    card.append(
      makeElement("strong", "", `Total: ${formatPrice(order.total)}`),
      makeElement("p", "", `Deliver to: ${order.deliveryInfo.name}, ${order.deliveryInfo.address}, ${order.deliveryInfo.city} ${order.deliveryInfo.postalCode}`),
    );
    if (isPayPalConfigured() && order.paymentStatus !== "Paid") {
      card.appendChild(makeActionButton("Continue PayPal Sandbox payment", "resume-payment", "button button-quiet button-small", order.id));
    }
    list.appendChild(card);
  });
  appContent.appendChild(list);
}

function validateForm(form) {
  if (!form.reportValidity()) return false;
  return true;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleAuthSubmit(form) {
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = activeView === "register" ? "Creating account..." : "Signing in...";
  form.setAttribute("aria-busy", "true");
  try {
    await submitAuthForm(form);
  } finally {
    if (submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
    form.removeAttribute("aria-busy");
  }
}

async function submitAuthForm(form) {
  const data = new FormData(form);
  const mode = activeView;
  if (mode === "register") {
    const email = String(data.get("email")).trim().toLowerCase();
    const firstName = String(data.get("firstname")).trim();
    const lastName = String(data.get("lastname")).trim();
    const password = String(data.get("password"));
    const confirmPassword = String(data.get("confirmPassword"));

    form.elements.confirmPassword.setCustomValidity(
      password === confirmPassword ? "" : "Passwords do not match.",
    );
    if (password !== confirmPassword) {
      showNotice("Passwords do not match.", true);
      form.elements.confirmPassword.focus();
      return;
    }
    if (!validEmail(email)) {
      showNotice("Enter a valid email address.", true);
      form.elements.email.focus();
      return;
    }
    if (!validateForm(form)) return;

    const account = await registerLocalAccount({
      email,
      password,
      firstName,
      lastName,
      phone: String(data.get("phone")).trim(),
      city: String(data.get("city")).trim(),
      street: String(data.get("street")).trim(),
    });
    activeView = "login";
    render();
    showNotice(`Account created for ${account.email}. You can now sign in with your email and password.`);
    return;
  }

  if (!validateForm(form)) return;
  const email = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));
  if (!validEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const localAccount = await authenticateLocalAccount(email, password);
  if (localAccount) {
    const user = createSession(`local-session:${crypto.randomUUID()}`, localAccount);
    activeView = user.role === "admin" ? "admin" : "home";
    render();
    showNotice(`Welcome back, ${user.name}.`);
    return;
  }

  const apiUsers = await getUsers();
  if (!Array.isArray(apiUsers)) {
    throw new Error("The Fake Store API returned an invalid user list.");
  }
  const matchingProfiles = apiUsers.filter(
    (user) => String(user?.email || "").trim().toLocaleLowerCase() === email,
  );
  if (matchingProfiles.length > 1) {
    throw new Error("More than one API account uses this email. Contact the demo administrator.");
  }
  const profile = matchingProfiles[0];
  if (!profile || typeof profile.username !== "string" || !profile.username.trim()) {
    throw new Error("No account with this email was found. Register a local account first.");
  }

  let response;
  try {
    response = await login({ username: profile.username, password });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw new Error("Email or password is incorrect.");
    }
    throw error;
  }
  if (!response || typeof response.token !== "string" || !response.token.trim()) {
    throw new Error("The authentication service did not return a valid token.");
  }
  if (!validEmail(String(profile.email || ""))) throw new Error("The API account has an invalid email.");
  const fullName = profile?.name && typeof profile.name === "object"
    ? [profile.name.firstname, profile.name.lastname].filter(Boolean).join(" ")
    : "";
  const role = isConfiguredAdmin(profile.username, profile.email) ? "admin" : "customer";
  const user = createSession(response.token, {
    id: profile?.id,
    username: profile.username,
    name: fullName || email,
    email: profile?.email,
    role,
  });
  activeView = role === "admin" ? "admin" : "home";
  render();
  showNotice(`Welcome back, ${user.name}.`);
}

async function placeOrder(form) {
  const user = requireCustomer();
  if (!user || !validateForm(form)) return;
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = "Placing order…";
  form.setAttribute("aria-busy", "true");
  try {
    const lines = getCart().map((line) => ({ ...line }));
    if (!lines.length) throw new Error("Your bag is empty.");
    if (JSON.stringify(getCart()) !== JSON.stringify(lines)) {
      throw new Error("Your bag changed while checkout was loading. Review it and try again.");
    }
    const data = new FormData(form);
    const phone = String(data.get("phone")).trim();
    if (!/^[0-9+()\s-]{7,20}$/.test(phone)) {
      throw new Error("Enter a phone number using 7–20 digits, spaces, or + ( ) - characters.");
    }
    if (!window.confirm("Place this order? It will be saved locally with Pending status.")) return;

    const items = await Promise.all(lines.map(async (line) => {
      const product = await getManagedProductById(line.productId);
      if (
        Number.isInteger(product.stock) &&
        product.stock >= 0 &&
        line.quantity > product.stock
      ) {
        throw new Error(`There is not enough tracked stock for ${product.title}.`);
      }
      return {
        productId: String(product.id),
        name: product.title,
        image: product.image,
        price: Number(product.price),
        quantity: line.quantity,
      };
    }));
    const order = createOrder({
      customer: {
        id: user.id ?? user.username,
        email: user.email,
        name: String(data.get("name")).trim(),
      },
      items,
      deliveryInfo: {
        name: String(data.get("name")).trim(),
        phone,
        address: String(data.get("address")).trim(),
        city: String(data.get("city")).trim(),
        postalCode: String(data.get("postalCode")).trim(),
      },
    });
    try {
      clearCartAfterOrder(lines);
    } catch (error) {
      activeView = "orders";
      render();
      showNotice(
        `Order ${order.id} was saved, but the cart could not be cleared: ${error.message}`,
        true,
      );
      return;
    }
    checkoutOrderId = null;
    updateHeader();
    activeView = "orders";
    render();
    showNotice(`Order ${order.id} was saved in this browser and is Pending.`);
  } catch (error) {
    showNotice(error.message || "Could not save your order. Your bag has been retained.", true);
  } finally {
    if (submit.isConnected) {
      submit.disabled = false;
      submit.textContent = originalLabel;
    }
    form.removeAttribute("aria-busy");
  }
}

function changeOrderStatus(id, status) {
  if (!isAdmin()) {
    showNotice("Administrator access is required.", true);
    return;
  }
  const verb = status === "Confirmed" ? "confirm" : "reject";
  if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} order ${id}?`)) return;
  try {
    const order = updateOrderStatus(id, status);
    render();
    showNotice(`Order ${id} marked ${order.status.toLowerCase()}.`);
  } catch (error) {
    showNotice(error.message || "Could not update the order.", true);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const navigation = document.getElementById("primary-navigation");
  if (navigation?.classList.contains("show") && window.bootstrap?.Collapse) {
    window.bootstrap.Collapse.getOrCreateInstance(navigation).hide();
  }

  if (action !== "admin-tab" && action.startsWith("admin-")) {
    if (!isAdmin()) {
      showNotice("Administrator access is required.", true);
      activeView = currentUser() ? "home" : "login";
      render();
      return;
    }
    try {
      const result = await handleAdminAction(button);
      if (!result.handled) return;
      if (result.error) {
        showNotice(result.error, true);
        return;
      }
      if (action === "admin-delete-product" || action === "admin-delete-category") {
        refreshCatalogData();
        if (action === "admin-delete-category") selectedCategory = "";
      }
      if (result.refresh) render();
      if (result.message) showNotice(result.message);
    } catch (error) {
      showNotice(error.message || "The management action failed.", true);
    }
    return;
  } else if (action === "home") {
    selectedCategory = "";
    activeView = "home";
    render();
  } else if (action === "products" || action === "browse") {
    selectedCategory = "";
    activeView = "products";
    render();
  } else if (action === "select-category") {
    selectedCategory = button.dataset.category || "";
    activeView = "products";
    render();
  } else if (action === "product-details") {
    selectedProductId = id;
    activeView = "product-details";
    render();
  } else if (action === "retry-catalog") {
    if (activeView === "home") render();
    else {
      activeView = "products";
      render();
    }
  } else if (action === "retry-product-details") {
    activeView = "product-details";
    render();
  } else if (action === "retry-wishlist") {
    activeView = "wishlist";
    render();
  } else if (action === "retry-cart") {
    activeView = "cart";
    render();
  } else if (action === "load-more") {
    loadMoreProducts();
  } else if (action === "login" || action === "register") {
    activeView = action;
    render();
  } else if (action === "logout") {
    try {
      clearSession();
      activeView = "home";
      render();
      showNotice("You have logged out.");
    } catch (error) {
      showNotice(error.message || "Could not clear the sign-in session.", true);
    }
  } else if (action === "wishlist" || action === "cart" || action === "orders" || action === "admin") {
    activeView = action;
    render();
  } else if (action === "toggle-wishlist") {
    void updateShoppingState(action, id, activeView, button.dataset.stock);
  } else if (["add-cart", "increase-cart", "decrease-cart", "remove-cart", "remove-wishlist", "move-wishlist-cart", "clear-cart"].includes(action)) {
    if (action === "clear-cart" && !window.confirm("Clear all items from your bag?")) return;
    void updateShoppingState(action, id, activeView, button.dataset.stock);
  } else if (action === "checkout") {
    checkoutOrderId = null;
    activeView = "checkout";
    render();
  } else if (action === "finish-checkout") {
    checkoutOrderId = null;
    activeView = "orders";
    render();
  } else if (action === "resume-payment") {
    const order = getOrderById(id);
    if (!order || order.customerId !== String(currentUser()?.id ?? currentUser()?.username)) {
      showNotice("That order is not available to this customer.", true);
      return;
    }
    checkoutOrderId = order.id;
    activeView = "checkout";
    render();
  } else if (action === "show-return-form") {
    selectedReturnItem = selectedReturnItem === id ? null : id;
    render();
  } else if (action === "cancel-return-form") {
    selectedReturnItem = null;
    render();
  } else if (action === "admin-tab") {
    if (!isAdmin()) {
      showNotice("Administrator access is required.", true);
      activeView = currentUser() ? "home" : "login";
      render();
      return;
    }
    adminTab = button.dataset.tab;
    render();
  } else if (action === "confirm-order") {
    changeOrderStatus(id, "Confirmed");
  } else if (action === "reject-order") {
    changeOrderStatus(id, "Rejected");
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === "managed-product-form" || form.id === "managed-category-form") {
    event.preventDefault();
    if (!isAdmin()) {
      showNotice("Administrator access is required.", true);
      activeView = currentUser() ? "home" : "login";
      render();
      return;
    }
    try {
      const result = await handleAdminFormSubmit(form);
      if (!result.handled) return;
      if (result.message) {
        refreshCatalogData();
        if (form.id === "managed-category-form") selectedCategory = "";
        render();
        showNotice(result.message);
      }
    } catch (error) {
      showNotice(error.message || "Could not save management changes.", true);
    }
  } else if (form.id === "auth-form") {
    event.preventDefault();
    try {
      await handleAuthSubmit(form);
    } catch (error) {
      const message = error.status === 401 || error.status === 403
        ? "Username or password is incorrect."
        : error.message || "Could not complete authentication.";
      showNotice(message, true);
    }
  } else if (form.id === "checkout-form") {
    event.preventDefault();
    placeOrder(form);
  } else if (form.id === "review-form") {
    event.preventDefault();
    const user = requireCustomer();
    if (!user) return;
    if (!form.reportValidity()) return;
    try {
      const result = submitProductReview({
        productId: form.dataset.productId,
        customer: { ...user, id: user.id ?? user.username },
        rating: new FormData(form).get("rating"),
        comment: new FormData(form).get("comment"),
      });
      render();
      showNotice(result.updated ? "Your product review was updated." : "Your product review was saved.");
    } catch (error) {
      showNotice(error.message || "Could not save the product review.", true);
    }
  } else if (form.id === "return-request-form") {
    event.preventDefault();
    const user = requireCustomer();
    if (!user || !form.reportValidity()) return;
    try {
      createReturnRequest({
        orderId: form.dataset.orderId,
        productId: form.dataset.productId,
        customerId: user.id ?? user.username,
        reason: new FormData(form).get("reason"),
      });
      selectedReturnItem = null;
      render();
      showNotice("Return request saved locally for admin review.");
    } catch (error) {
      showNotice(error.message || "Could not save the return request.", true);
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "product-category") {
    selectedCategory = event.target.value;
    renderAsyncPage(renderProducts, selectedCategory);
  } else if (["product-sort", "min-price", "max-price"].includes(event.target.id)) {
    updateProductListing();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "product-search") updateProductListing();
});

async function updateShoppingState(action, productId, view, stock) {
  try {
    const addedToWishlist = await handleShoppingAction(action, productId, stock);
    let syncError = null;
    if (["add-cart", "increase-cart", "decrease-cart", "remove-cart", "move-wishlist-cart", "clear-cart"].includes(action)) {
      try {
        await syncCurrentCartToApi();
      } catch (error) {
        syncError = error;
      }
    }
    updateHeader();
    if (view === "wishlist" || view === "cart") render();
    else if (view === "products") updateProductListing();
    else if (view === "product-details") render();
    else if (view === "home") render();
    if (action === "add-cart" || action === "increase-cart" || action === "move-wishlist-cart") {
      showNotice("Added to your bag.");
    } else if (action === "toggle-wishlist") {
      showNotice(addedToWishlist ? "Saved to your wishlist." : "Removed from your wishlist.");
    } else if (action === "remove-cart" || action === "decrease-cart") {
      showNotice("Your bag was updated.");
    } else if (action === "remove-wishlist") {
      showNotice("Removed from your wishlist.");
    } else if (action === "clear-cart") {
      showNotice("Your bag was cleared.");
    }
    if (syncError) showNotice(`Saved locally, but the Fake Store API cart mirror failed: ${syncError.message}`, true);
  } catch (error) {
    showNotice(error.message || "Could not update your cart or wishlist.", true);
  }
}

initializeStore().catch((error) => {
  console.error("Store initialization failed:", error);
  appContent.replaceChildren(
    emptyState(
      "The store could not start",
      error.message || "Check browser storage and reload the page.",
    ),
  );
});
