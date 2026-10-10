import { getUsers } from "../services/users.js";
import { getLocalRegisteredUsers } from "../services/localAccounts.js";
import { getCurrentUser } from "../services/authSession.js";
import { getOrders } from "../services/orders.js";
import { decideReturnRequest, getReturnRequests } from "../services/returns.js";
import {
  addCustomCategory,
  createManagedProduct,
  deleteCustomCategory,
  deleteManagedProduct,
  getManagedCategories,
  getManagedProducts,
  getManagedProductById,
  renameCustomCategory,
  updateManagedProduct,
} from "../services/managedStore.js";
import {
  formatPrice,
  makeActionButton,
  makeElement,
  safeImageUrl,
} from "../utils/dom.js";

let editingProductId = null;
let editingCategoryName = null;
let detailProductId = null;
let requestPending = false;
let activeOrderStatus = "All";

function assertAdmin() {
  if (getCurrentUser()?.role !== "admin") {
    throw new Error("Administrator access is required.");
  }
}

function status(message, kind = "info") {
  const alert = makeElement("div", `alert alert-${kind}`, message);
  alert.setAttribute("role", kind === "danger" ? "alert" : "status");
  return alert;
}

function orderStatusBadge(orderStatus) {
  const badge = makeElement(
    "span",
    `order-status-badge status-${orderStatus.toLocaleLowerCase()}`,
    orderStatus,
  );
  badge.setAttribute("aria-label", `Order status: ${orderStatus}`);
  return badge;
}

function statCard(title, value, detail) {
  const card = makeElement("article", "card admin-stat-card h-100");
  const body = makeElement("div", "card-body");
  body.append(
    makeElement("p", "admin-stat-label", title),
    makeElement("p", "admin-stat-value", value),
    makeElement("p", "admin-stat-detail", detail),
  );
  card.appendChild(body);
  return card;
}

function renderNavigation(container, selectedTab) {
  const nav = makeElement("nav", "nav nav-pills admin-nav mb-4");
  nav.setAttribute("aria-label", "Admin sections");
  [
    ["products", "Products"],
    ["categories", "Categories"],
    ["orders", "Orders"],
    ["users", "Users"],
  ].forEach(([tab, label]) => {
    const button = makeActionButton(
      label,
      "admin-tab",
      `nav-link${selectedTab === tab ? " active" : ""}`,
    );
    button.dataset.tab = tab;
    nav.appendChild(button);
  });
  container.appendChild(nav);
}

async function renderDashboard(container, localStore) {
  let orders = null;
  let orderError = null;
  try {
    orders = getOrders();
  } catch (error) {
    orderError = error.message || "Local orders could not be loaded.";
  }
  const heading = makeElement("div", "page-heading");
  const copy = makeElement("div");
  copy.append(
    makeElement("div", "eyebrow", "Store administration"),
    makeElement("h1", "", "Admin dashboard"),
    makeElement(
      "p",
      "",
      "Manage API-backed product records and the local demo store. UI role checks are not secure authorization.",
    ),
  );
  heading.appendChild(copy);
  container.appendChild(heading);

  const row = makeElement("div", "row row-cols-1 row-cols-sm-2 row-cols-xl-5 g-3 mb-4");
  container.appendChild(row);
  row.append(
    statCard("Total products", "Loading…", "Fake Store API plus local changes"),
    statCard("Total categories", "Loading…", "API categories plus custom local categories"),
    statCard("Total orders", orders ? String(orders.length) : "Unavailable", orderError || "Local browser orders"),
    statCard(
      "Pending orders",
      orders ? String(orders.filter((order) => order.status === "Pending").length) : "Unavailable",
      orderError || "Local browser orders awaiting review",
    ),
    statCard("Registered users", "Loading…", "Fake Store API user profiles"),
  );

  try {
    const results = await Promise.allSettled([
      getManagedProducts(),
      getManagedCategories(),
      getUsers(),
    ]);
    const [productsResult, categoriesResult, usersResult] = results;
    if (productsResult.status === "fulfilled" && !Array.isArray(productsResult.value)) {
      throw new Error("The products response was not a list.");
    }
    if (categoriesResult.status === "fulfilled" && !Array.isArray(categoriesResult.value)) {
      throw new Error("The categories response was not a list.");
    }
    if (usersResult.status === "fulfilled" && !Array.isArray(usersResult.value)) {
      throw new Error("The users response was not a list.");
    }
    const countCard = (title, result, detail) =>
      statCard(title, result.status === "fulfilled" ? String(result.value.length) : "Unavailable", detail);
    row.replaceChildren(
      countCard("Total products", productsResult, "Fake Store API plus local changes"),
      countCard("Total categories", categoriesResult, "API categories plus custom local categories"),
      statCard("Total orders", orders ? String(orders.length) : "Unavailable", orderError || "Local browser orders"),
      statCard(
        "Pending orders",
        orders ? String(orders.filter((order) => order.status === "Pending").length) : "Unavailable",
        orderError || "Local browser orders awaiting review",
      ),
      countCard("Registered users", usersResult, "Fake Store API user profiles"),
    );
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "A dashboard data source could not be loaded.");
    if (failures.length) container.appendChild(status(failures.join(" "), "warning"));
  } catch (error) {
    row.replaceChildren(
      statCard("Total products", "Unavailable", "Could not load API products"),
      statCard("Total categories", "Unavailable", "Could not load API categories"),
      statCard("Total orders", orders ? String(orders.length) : "Unavailable", orderError || "Local browser orders"),
      statCard(
        "Pending orders",
        orders ? String(orders.filter((order) => order.status === "Pending").length) : "Unavailable",
        orderError || "Local browser orders awaiting review",
      ),
      statCard("Registered users", "Unavailable", "Could not load API user profiles"),
    );
    container.appendChild(status(error.message || "Dashboard data could not be loaded.", "warning"));
  }
}

function makeFormField({ id, name, label, type = "text", value = "", min, max, step, required = true }) {
  const wrapper = makeElement("div", "field mb-3");
  const fieldLabel = makeElement("label", "form-label", label);
  fieldLabel.htmlFor = id;
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  input.className = "form-control";
  input.id = id;
  input.name = name;
  input.value = value ?? "";
  input.required = required;
  if (type !== "textarea") input.type = type;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  if (step !== undefined) input.step = step;
  if (type === "text" && min !== undefined) input.minLength = Number(min);
  if (type === "text" && max !== undefined) input.maxLength = Number(max);
  if (type === "textarea") {
    input.rows = 4;
    input.maxLength = 500;
  }
  wrapper.append(fieldLabel, input);
  return wrapper;
}

function renderProductForm(container, product, categories) {
  const card = makeElement("section", "card admin-editor mb-4");
  const body = makeElement("div", "card-body");
  body.appendChild(makeElement("h2", "h5 card-title", product ? `Edit product #${product.id}` : "Add product"));
  const form = document.createElement("form");
  form.id = "managed-product-form";
  form.dataset.id = product?.id || "";
  form.noValidate = true;
  form.append(
    makeFormField({ id: "managed-product-title", name: "title", label: "Title / name", value: product?.title || "", max: "90" }),
    makeFormField({ id: "managed-product-image", name: "image", label: "Image URL", type: "url", value: product?.image || "" }),
  );
  const categoryGroup = makeElement("div", "field mb-3");
  const categoryLabel = makeElement("label", "form-label", "Category");
  categoryLabel.htmlFor = "managed-product-category";
  const categorySelect = document.createElement("select");
  categorySelect.className = "form-select";
  categorySelect.id = "managed-product-category";
  categorySelect.name = "category";
  categorySelect.required = true;
  categories.forEach(({ name }) => {
    const option = makeElement("option", "", name);
    option.value = name;
    categorySelect.appendChild(option);
  });
  categorySelect.value = product?.category || categories[0]?.name || "";
  categoryGroup.append(categoryLabel, categorySelect);
  form.appendChild(categoryGroup);
  form.append(
    makeFormField({ id: "managed-product-price", name: "price", label: "Price", type: "number", value: product?.price ?? "", min: "0.01", step: "0.01" }),
    makeFormField({
      id: "managed-product-stock",
      name: "stock",
      label: "Stock quantity (managed locally)",
      type: "number",
      value: product?.stock ?? "",
      min: "0",
      step: "1",
      required: false,
    }),
    makeFormField({ id: "managed-product-description", name: "description", label: "Description", type: "textarea", value: product?.description || "" }),
  );
  const actions = makeElement("div", "d-flex flex-wrap gap-2");
  const submit = makeElement("button", "btn btn-success", product ? "Save product" : "Create product");
  submit.type = "submit";
  const cancel = makeActionButton("Cancel", "admin-cancel-edit", "btn btn-outline-secondary");
  actions.append(submit, cancel);
  form.appendChild(actions);
  body.appendChild(form);
  card.appendChild(body);
  container.appendChild(card);
}

function productTable(container, products) {
  if (!products.length) {
    container.appendChild(status("No products are available yet.", "secondary"));
    return;
  }
  const responsive = makeElement("div", "table-responsive");
  const table = makeElement("table", "table table-hover align-middle");
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  ["ID", "Product", "Category", "Price", "Stock", "Source", "Actions"].forEach((label) => {
    header.appendChild(makeElement("th", "", label));
  });
  head.appendChild(header);
  const body = document.createElement("tbody");
  products.forEach((product) => {
    const row = document.createElement("tr");
    [
      product.id,
      product.title,
      product.category,
      formatPrice(product.price),
      product.stock === null ? "Not recorded" : String(product.stock),
      product.source === "local" ? "Local demo" : "API record",
    ].forEach((value) => row.appendChild(makeElement("td", "", value)));
    const actions = makeElement("td", "d-flex flex-wrap gap-1");
    [
      ["Details", "admin-product-details", "btn btn-sm btn-outline-secondary"],
      ["Edit", "admin-edit-product", "btn btn-sm btn-outline-success"],
      ["Delete", "admin-delete-product", "btn btn-sm btn-outline-danger"],
    ].forEach(([label, action, className]) => {
      actions.appendChild(makeActionButton(label, action, className, product.id));
    });
    row.appendChild(actions);
    body.appendChild(row);
  });
  table.append(head, body);
  responsive.appendChild(table);
  container.appendChild(responsive);
}

async function renderProducts(container) {
  container.appendChild(makeElement("h2", "h4 mb-3", "Product management"));
  const formHost = makeElement("div");
  container.appendChild(formHost);
  const list = makeElement("section", "card");
  const listBody = makeElement("div", "card-body");
  listBody.appendChild(makeElement("h3", "h5 card-title", "Products"));
  list.appendChild(listBody);
  container.appendChild(list);
  listBody.appendChild(status("Loading products…", "light"));
  try {
    const [products, categories] = await Promise.all([getManagedProducts(), getManagedCategories()]);
    if (!categories.length) {
      formHost.appendChild(
        status("No categories exist yet. Add a custom category before creating products.", "warning"),
      );
    }
    if (editingProductId) {
      const product = products.find((item) => String(item.id) === String(editingProductId));
      if (!product) throw new Error("That product could not be found.");
      renderProductForm(formHost, product, categories);
    } else {
      renderProductForm(formHost, null, categories);
    }
    listBody.replaceChildren(makeElement("h3", "h5 card-title", `Products (${products.length})`));
    productTable(listBody, products);
    if (detailProductId) {
      const detail = await getManagedProductById(detailProductId);
      const detailCard = makeElement("section", "card mt-3");
      const detailBody = makeElement("div", "card-body");
      detailBody.append(
        makeElement("h3", "h5", detail.title),
        makeElement("p", "", `ID: ${detail.id} · ${detail.category} · ${formatPrice(detail.price)}`),
        makeElement("p", "", detail.description),
        makeElement("p", "", `Stock: ${detail.stock === null ? "Not recorded in the local inventory model" : detail.stock}`),
      );
      if (safeImageUrl(detail.image)) {
        const image = document.createElement("img");
        image.src = safeImageUrl(detail.image);
        image.alt = detail.title;
        image.className = "admin-product-image";
        detailBody.appendChild(image);
      }
      detailBody.appendChild(makeActionButton("Close details", "admin-close-details", "btn btn-outline-secondary"));
      detailCard.appendChild(detailBody);
      container.appendChild(detailCard);
    }
  } catch (error) {
    formHost.replaceChildren();
    listBody.replaceChildren(
      makeElement("h3", "h5 card-title", "Products"),
      status(error.message || "Products could not be loaded.", "danger"),
    );
  }
}

async function renderCategories(container) {
  container.appendChild(makeElement("h2", "h4 mb-3", "Category management"));
  const formCard = makeElement("section", "card admin-editor mb-4");
  const formBody = makeElement("div", "card-body");
  formBody.appendChild(makeElement("h3", "h5 card-title", editingCategoryName ? "Rename custom category" : "Add custom category"));
  const form = document.createElement("form");
  form.id = "managed-category-form";
  form.dataset.oldName = editingCategoryName || "";
  const field = makeFormField({
    id: "managed-category-name",
    name: "name",
    label: "Category name",
    value: editingCategoryName || "",
    max: "40",
  });
  field.querySelector("input").maxLength = 40;
  form.appendChild(field);
  const actions = makeElement("div", "d-flex gap-2");
  const submit = makeElement("button", "btn btn-success", editingCategoryName ? "Save category" : "Add category");
  submit.type = "submit";
  actions.append(submit, makeActionButton("Cancel", "admin-cancel-category", "btn btn-outline-secondary"));
  form.appendChild(actions);
  formBody.appendChild(form);
  formCard.appendChild(formBody);
  container.appendChild(formCard);

  const list = makeElement("div", "row g-3");
  container.appendChild(list);
  list.appendChild(status("Loading categories…", "light"));
  try {
    const [categories, products] = await Promise.all([getManagedCategories(), getManagedProducts()]);
    list.replaceChildren();
    if (!categories.length) list.appendChild(status("No categories available.", "secondary"));
    categories.forEach(({ name, source }) => {
      const column = makeElement("div", "col-12 col-md-6");
      const card = makeElement("article", "card h-100");
      const body = makeElement("div", "card-body");
      const usageCount = products.filter((product) => product.category === name).length;
      body.append(
        makeElement("h3", "h5", name),
        makeElement("p", "mb-2", `${source === "api" ? "API-provided" : "Custom local"} · ${usageCount} products`),
      );
      if (source === "local") {
        const actions = makeElement("div", "d-flex flex-wrap gap-2");
        const rename = makeActionButton("Rename", "admin-rename-category", "btn btn-sm btn-outline-success");
        rename.dataset.name = name;
        const remove = makeActionButton("Delete", "admin-delete-category", "btn btn-sm btn-outline-danger");
        remove.dataset.name = name;
        actions.append(rename, remove);
        body.appendChild(actions);
      } else {
        body.appendChild(makeElement("span", "badge text-bg-secondary", "Managed by Fake Store API"));
      }
      card.appendChild(body);
      column.appendChild(card);
      list.appendChild(column);
    });
  } catch (error) {
    list.replaceChildren(status(error.message || "Categories could not be loaded.", "danger"));
  }
}

async function renderUsers(container) {
  container.append(
    makeElement("h2", "h4 mb-2", "Registered users"),
    makeElement(
      "p",
      "text-secondary",
      "Fake Store API profiles and customer accounts registered in this browser. Passwords and password hashes are never shown.",
    ),
  );
  const list = makeElement("div", "table-responsive");
  list.appendChild(status("Loading users…", "light"));
  container.appendChild(list);
  try {
    const localUsers = getLocalRegisteredUsers();
    const apiUsers = await getUsers();
    if (!Array.isArray(apiUsers)) throw new Error("The users response was not a list.");
    list.replaceChildren();
    const sections = [
      {
        title: "Customers registered in this browser",
        users: localUsers,
        emptyMessage: "No customer accounts have been registered in this browser yet.",
        name: (user) => user.name || "—",
        identifier: (user) => user.email || "—",
        source: "Local account",
      },
      {
        title: "Fake Store API profiles",
        users: apiUsers,
        emptyMessage: "No user profiles were returned by Fake Store API.",
        name: (user) => [user.name?.firstname, user.name?.lastname].filter(Boolean).join(" ") || "—",
        identifier: (user) => user.username || "—",
        source: "Fake Store API",
      },
    ];
    sections.forEach(({ title, users, emptyMessage, name, identifier, source }) => {
      list.appendChild(makeElement("h3", "h5 mt-3 mb-2", title));
      if (!users.length) {
        list.appendChild(status(emptyMessage, "secondary"));
        return;
      }
      const table = makeElement("table", "table table-hover align-middle");
      const header = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["ID", "Name", "Email", "Account source"].forEach((label) =>
        headerRow.appendChild(makeElement("th", "", label)),
      );
      header.appendChild(headerRow);
      const body = document.createElement("tbody");
      users.forEach((user) => {
        const row = document.createElement("tr");
        [user.id ?? "—", name(user), user.email || identifier(user), source].forEach((value) =>
          row.appendChild(makeElement("td", "", String(value))),
        );
        body.appendChild(row);
      });
      table.append(header, body);
      const responsiveTable = makeElement("div", "table-responsive");
      responsiveTable.appendChild(table);
      list.appendChild(responsiveTable);
    });
  } catch (error) {
    list.replaceChildren(status(error.message || "Users could not be loaded.", "danger"));
  }
}

async function renderOrders(container) {
  container.append(
    makeElement("h2", "h4 mb-2", "Local demo orders"),
    makeElement("p", "text-secondary", "Orders and status updates are stored only in this browser."),
  );
  const filter = document.createElement("select");
  filter.className = "form-select mb-3";
  filter.setAttribute("aria-label", "Filter orders by status");
  ["All", "Pending", "Confirmed", "Rejected"].forEach((value) => {
    const option = makeElement("option", "", value);
    option.value = value;
    option.selected = activeOrderStatus === value;
    filter.appendChild(option);
  });
  filter.addEventListener("change", () => {
    activeOrderStatus = filter.value;
    const section = container;
    section.replaceChildren();
    void renderOrders(section);
  });
  container.appendChild(filter);
  let orders;
  try {
    orders = getOrders();
  } catch (error) {
    container.appendChild(status(error.message || "Saved orders could not be loaded.", "danger"));
    return;
  }
  const filteredOrders = activeOrderStatus === "All"
    ? orders
    : orders.filter((order) => order.status === activeOrderStatus);
  if (!filteredOrders.length) {
    container.appendChild(status(
      orders.length ? `No ${activeOrderStatus.toLowerCase()} orders.` : "No local demo orders yet.",
      "secondary",
    ));
  } else {
    const list = makeElement("div", "order-list");
    [...filteredOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((order) => {
      const card = makeElement("article", `admin-order-card status-${order.status.toLocaleLowerCase()}`);
      const body = makeElement("div", "admin-order-body");
      const header = makeElement("div", "admin-order-header");
      const summary = makeElement("div", "admin-order-summary");
      summary.append(
        makeElement("h3", "h5 mb-1", `Order ${order.id}`),
        makeElement("p", "mb-1", `${order.customerName} · ${order.customerEmail}`),
        makeElement("p", "small text-secondary mb-0", `Placed ${new Date(order.createdAt).toLocaleString()}`),
      );
      header.append(summary, orderStatusBadge(order.status));
      body.append(
        header,
        makeElement("p", "admin-order-total", `${order.items.length} line items · ${formatPrice(order.total)}`),
        makeElement("p", "admin-order-delivery", `Deliver to: ${order.deliveryInfo.name}, ${order.deliveryInfo.address}, ${order.deliveryInfo.city} ${order.deliveryInfo.postalCode} · ${order.deliveryInfo.phone}`),
      );
      order.items.forEach((item) => body.appendChild(
        makeElement("p", "admin-order-item", `${item.quantity} × ${item.name} · ${formatPrice(item.price)} each`),
      ));
      if (order.status === "Pending") {
        const actions = makeElement("div", "admin-order-actions");
        actions.append(
          makeActionButton("Confirm order", "confirm-order", "button button-dark button-small", order.id),
          makeActionButton("Reject", "reject-order", "button button-danger button-small", order.id),
        );
        body.appendChild(actions);
      } else {
        body.appendChild(makeElement("p", "admin-order-updated", `Last updated ${new Date(order.timestamps.updatedAt).toLocaleString()}`));
      }
      card.appendChild(body);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  container.appendChild(makeElement("h2", "h4 mt-4", "Return requests"));
  let requests;
  try {
    requests = getReturnRequests();
  } catch (error) {
    container.appendChild(status(error.message || "Return requests could not be loaded.", "danger"));
    return;
  }
  if (!requests.length) {
    container.appendChild(status("No local return requests.", "secondary"));
    return;
  }
  const returnList = makeElement("div", "order-list");
  requests.forEach((request) => {
    const card = makeElement("article", "card");
    const body = makeElement("div", "card-body");
    body.append(
      makeElement("h3", "h5", `${request.productName} · Return ${request.status}`),
      makeElement("p", "", `Order ${request.orderId} · ${request.customerName} · ${request.customerEmail}`),
      makeElement("p", "", `Requested ${new Date(request.requestedAt).toLocaleString()}`),
      makeElement("p", "", `Reason: ${request.reason}`),
    );
    if (request.status === "Requested") {
      const noteLabel = makeElement("label", "form-label", "Optional admin note");
      noteLabel.htmlFor = `return-note-${request.id}`;
      const note = document.createElement("textarea");
      note.id = `return-note-${request.id}`;
      note.name = "adminNote";
      note.className = "form-control mb-2";
      note.maxLength = 300;
      note.rows = 2;
      const approve = makeActionButton("Approve", "admin-return-decision", "btn btn-sm btn-success me-2", request.id);
      approve.dataset.decision = "Approved";
      const reject = makeActionButton("Reject", "admin-return-decision", "btn btn-sm btn-outline-danger", request.id);
      reject.dataset.decision = "Rejected";
      body.append(noteLabel, note, approve, reject);
    } else {
      body.append(
        makeElement("p", "", `Decision: ${request.status} · ${request.decidedAt ? new Date(request.decidedAt).toLocaleString() : "date unavailable"}`),
        makeElement("p", "", request.adminNote ? `Admin note: ${request.adminNote}` : "No admin note."),
      );
    }
    card.appendChild(body);
    returnList.appendChild(card);
  });
  container.appendChild(returnList);
}

export async function renderAdminPanel(container, selectedTab, localStore, isCurrent = () => true) {
  if (getCurrentUser()?.role !== "admin") {
    container.replaceChildren(status("Administrator access is required.", "danger"));
    return;
  }
  if (!isCurrent()) return;
  container.replaceChildren();
  await renderDashboard(container, localStore);
  if (!isCurrent()) return;
  renderNavigation(container, selectedTab);
  const section = makeElement("section", "admin-section");
  container.appendChild(section);
  if (selectedTab === "products") await renderProducts(section);
  else if (selectedTab === "categories") await renderCategories(section);
  else if (selectedTab === "orders") await renderOrders(section);
  else if (selectedTab === "users") await renderUsers(section);
}

function validProductForm(data) {
  const title = String(data.get("title")).trim();
  const image = String(data.get("image")).trim();
  const price = Number(data.get("price"));
  const stockText = String(data.get("stock")).trim();
  const stock = stockText === "" ? null : Number(stockText);
  const description = String(data.get("description")).trim();
  const category = String(data.get("category"));
  if (title.length < 2 || title.length > 90) throw new Error("Product title must contain 2–90 characters.");
  if (!safeImageUrl(image)) throw new Error("Enter a valid HTTP or HTTPS image URL.");
  if (!Number.isFinite(price) || price <= 0 || price > 1000000) throw new Error("Price must be greater than zero.");
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1000000)) {
    throw new Error("Stock must be a whole number of zero or more, or blank if not tracked.");
  }
  if (description.length < 5 || description.length > 500) {
    throw new Error("Description must contain 5–500 characters.");
  }
  if (!category) throw new Error("Choose a category.");
  return { title, image, price, stock, description, category };
}

async function withSubmitLoading(form, operation) {
  if (requestPending) throw new Error("Please wait for the current management request to finish.");
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;
  requestPending = true;
  button.disabled = true;
  button.textContent = "Saving…";
  form.setAttribute("aria-busy", "true");
  try {
    return await operation();
  } finally {
    requestPending = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
    form.removeAttribute("aria-busy");
  }
}

export async function handleAdminFormSubmit(form) {
  assertAdmin();
  if (form.id === "managed-product-form") {
    if (!form.reportValidity()) return { handled: true };
    return withSubmitLoading(form, async () => {
      const values = validProductForm(new FormData(form));
      const isUpdate = Boolean(form.dataset.id);
      if (isUpdate) {
        await updateManagedProduct(form.dataset.id, values);
        editingProductId = null;
        return { handled: true, message: "Product update was submitted. The API may simulate writes; this browser now displays the local override." };
      }
      await createManagedProduct(values);
      return { handled: true, message: "Product creation was submitted. The API may simulate writes; the product is stored locally for this demo." };
    });
  }
  if (form.id === "managed-category-form") {
    if (!form.reportValidity()) return { handled: true };
    return withSubmitLoading(form, async () => {
      const name = String(new FormData(form).get("name")).trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 40) throw new Error("Category name must contain 2–40 characters.");
      const categories = await getManagedCategories();
      const duplicate = categories.some(
        ({ name: existing }) =>
          existing.toLocaleLowerCase() === name.toLocaleLowerCase() &&
          existing !== form.dataset.oldName,
      );
      if (duplicate) throw new Error("A category with that name already exists.");
      if (form.dataset.oldName) {
        renameCustomCategory(form.dataset.oldName, name);
        editingCategoryName = null;
        return { handled: true, message: "Custom category renamed and saved locally." };
      }
      addCustomCategory(name);
      return { handled: true, message: "Custom category added and saved locally." };
    });
  }
  return { handled: false };
}

export async function handleAdminAction(button) {
  assertAdmin();
  const { action, id, name } = button.dataset;
  if (action === "admin-return-decision") {
    const note = button.closest(".card-body")?.querySelector('[name="adminNote"]')?.value || "";
    const request = decideReturnRequest(id, button.dataset.decision, note);
    return {
      handled: true,
      refresh: true,
      message: `Return request ${request.status.toLowerCase()}.`,
    };
  }
  if (action === "admin-cancel-edit") {
    editingProductId = null;
    return { handled: true, refresh: true };
  }
  if (action === "admin-cancel-category") {
    editingCategoryName = null;
    return { handled: true, refresh: true };
  }
  if (action === "admin-close-details") {
    detailProductId = null;
    return { handled: true, refresh: true };
  }
  if (action === "admin-product-details") {
    detailProductId = id;
    return { handled: true, refresh: true };
  }
  if (action === "admin-edit-product") {
    const product = await getManagedProductById(id);
    editingProductId = String(product.id);
    detailProductId = null;
    return { handled: true, refresh: true };
  }
  if (action === "admin-delete-product") {
    const product = await getManagedProductById(id);
    if (!window.confirm(`Delete "${product.title}"? The API may simulate deletion; this demo will also hide it locally.`)) {
      return { handled: true };
    }
    const result = await deleteManagedProduct(id);
    return {
      handled: true,
      refresh: true,
      message: result.wasCreatedLocally
        ? "Delete was submitted (Fake Store API may simulate it); the locally created demo product was removed from this browser."
        : "Delete was submitted. The API may simulate writes; this browser now hides the product locally.",
    };
  }
  if (action === "admin-rename-category") {
    editingCategoryName = name;
    return { handled: true, refresh: true };
  }
  if (action === "admin-delete-category") {
    const products = await getManagedProducts();
    if (products.some((product) => product.category === name)) {
      return { handled: true, error: "Reassign or delete all products in this category before deleting it." };
    }
    if (!window.confirm(`Delete the custom category "${name}"?`)) return { handled: true };
    deleteCustomCategory(name);
    return { handled: true, refresh: true, message: "Custom category deleted from this browser." };
  }
  return { handled: false };
}
