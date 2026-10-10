import {
  getManagedCategories,
  getManagedProductById,
  getManagedProducts,
  getManagedProductsByCategory,
} from "../services/managedStore.js";
import {
  addToCart,
  changeCartQuantity,
  clearCart,
  getCart,
  getWishlist,
  moveWishlistItemToCart,
  removeFromCart,
  removeFromWishlist,
  toggleWishlist,
} from "../services/shoppingState.js";
import { getCurrentUser } from "../services/authSession.js";
import {
  getCustomerReview,
  getProductReviewSummary,
  getReviewsForProduct,
} from "../services/reviews.js";
import { productCard } from "../components/productCard.js";
import { formatPrice, makeActionButton, makeElement, safeImageUrl } from "../utils/dom.js";

const PAGE_SIZE = 8;
let categories = [];
let allProducts = null;
let listingProducts = [];
let visibleCount = PAGE_SIZE;

function displayProduct(product) {
  return {
    ...product,
    id: String(product.id),
    name: product.title,
    rating: product.rating || null,
  };
}

function addLoading(container, message = "Loading products...") {
  const status = makeElement("div", "catalog-status", message);
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const spinner = makeElement("span", "spinner-border spinner-border-sm me-2");
  spinner.setAttribute("aria-hidden", "true");
  status.prepend(spinner);
  container.appendChild(status);
}

function addError(container, error, retryAction) {
  const alert = makeElement("div", "alert alert-danger", error.message || "Products could not be loaded.");
  alert.setAttribute("role", "alert");
  alert.appendChild(makeActionButton("Try again", retryAction, "button button-quiet button-small"));
  container.replaceChildren(alert);
}

function appendProductGrid(container, products, wishlist = getWishlist(), showMoveToCart = false) {
  const grid = makeElement("div", "row g-3 g-lg-4 product-grid");
  grid.setAttribute("aria-label", "Products");
  products.forEach((product) => {
    const column = makeElement("div", "col-6 col-md-4 col-xl-3");
    column.appendChild(productCard(displayProduct(product), { wishlist, showMoveToCart }));
    grid.appendChild(column);
  });
  container.appendChild(grid);
  return grid;
}

function appendEmptyState(container, title, description, action = "products", label = "Browse products") {
  const empty = makeElement("section", "empty-state");
  empty.append(
    makeElement("h2", "", title),
    makeElement("p", "", description),
    makeActionButton(label, action, "button button-dark"),
  );
  container.appendChild(empty);
}

function makeHeading(eyebrow, title, description, headingTag = "h2") {
  const heading = makeElement("div", "section-heading");
  const copy = makeElement("div");
  copy.append(
    makeElement("p", "eyebrow", eyebrow),
    makeElement(headingTag, "", title),
    makeElement("p", "", description),
  );
  heading.appendChild(copy);
  return heading;
}

function loadCategoryNames() {
  if (categories.length) return Promise.resolve(categories);
  return getManagedCategories().then((result) => {
    categories = result.map(({ name }) => name);
    return categories;
  });
}

export function refreshCatalogData() {
  categories = [];
  allProducts = null;
}

function getProducts() {
  return getManagedProducts();
}

function getProductById(id) {
  return getManagedProductById(id);
}

function makeCategoryLink(category, label = category) {
  const button = makeActionButton(label, "select-category", "category-link");
  button.dataset.category = category;
  return button;
}

export async function renderHome(container, isCurrent = () => true) {
  const hero = makeElement("section", "hero");
  const copy = makeElement("div", "hero-copy");
  copy.append(
    makeElement("p", "eyebrow", "Thoughtful things, made for every day"),
    makeElement("h1", "", "Find your everyday favorite."),
    makeElement("p", "", "Considered essentials for home, wardrobe, and everything in between. Good things, chosen well."),
    makeActionButton("Explore the collection", "products", "button button-dark"),
  );
  const visual = makeElement("div", "hero-visual");
  visual.setAttribute("role", "img");
  visual.setAttribute("aria-label", "Curated everyday products");
  visual.appendChild(makeElement("span", "hero-tag", "A little more considered."));
  hero.append(copy, visual);
  container.replaceChildren(hero);

  const categorySection = makeElement("section", "category-section");
  categorySection.appendChild(makeHeading("Find your fit", "Shop by category", "Explore thoughtful picks by category."));
  const categoryLinks = makeElement("div", "category-links");
  addLoading(categoryLinks, "Loading categories...");
  categorySection.appendChild(categoryLinks);
  container.appendChild(categorySection);

  const featured = makeElement("section", "featured-section");
  featured.appendChild(makeHeading("The collection", "Featured products", "A few customer favorites from the collection."));
  const featuredProducts = makeElement("div", "featured-products");
  addLoading(featuredProducts);
  featured.appendChild(featuredProducts);
  featured.appendChild(makeActionButton("Shop all products", "products", "button button-dark"));
  container.appendChild(featured);

  try {
    const [productList, categoryList] = await Promise.all([getProducts(), loadCategoryNames()]);
    if (!isCurrent()) return;
    if (!Array.isArray(productList)) throw new Error("The products response was not a list.");
    allProducts = productList;
    categoryLinks.replaceChildren();
    categoryLinks.appendChild(makeCategoryLink("", "All products"));
    categoryList.forEach((category) => categoryLinks.appendChild(makeCategoryLink(category)));
    featuredProducts.replaceChildren();
    const topProducts = [...productList]
      .sort((a, b) => (b.rating?.rate || 0) - (a.rating?.rate || 0))
      .slice(0, 4);
    if (!topProducts.length) {
      appendEmptyState(featuredProducts, "No featured products yet", "Please check back soon.");
      return;
    }
    appendProductGrid(featuredProducts, topProducts);
  } catch (error) {
    if (!isCurrent()) return;
    addError(categoryLinks, error, "retry-catalog");
    addError(featuredProducts, error, "retry-catalog");
  }
}

function filteredProducts() {
  const search = document.getElementById("product-search")?.value.trim().toLocaleLowerCase() || "";
  const minValue = document.getElementById("min-price")?.value;
  const maxValue = document.getElementById("max-price")?.value;
  const min = minValue === "" || minValue === undefined ? null : Number(minValue);
  const max = maxValue === "" || maxValue === undefined ? null : Number(maxValue);
  const error = document.getElementById("price-range-error");
  if (min !== null && max !== null && min > max) {
    error.textContent = "Minimum price must not exceed maximum price.";
    error.classList.remove("hidden");
    return null;
  }
  error.textContent = "";
  error.classList.add("hidden");

  const sort = document.getElementById("product-sort")?.value || "featured";
  const matches = listingProducts.filter((product) => {
    const matchesSearch = product.title.toLocaleLowerCase().includes(search);
    const matchesMin = min === null || product.price >= min;
    const matchesMax = max === null || product.price <= max;
    return matchesSearch && matchesMin && matchesMax;
  });
  if (sort === "price-low") matches.sort((a, b) => a.price - b.price);
  if (sort === "price-high") matches.sort((a, b) => b.price - a.price);
  if (sort === "name") matches.sort((a, b) => a.title.localeCompare(b.title));
  return matches;
}

function updateListingGrid() {
  const results = document.getElementById("product-results");
  if (!results) return;
  const products = filteredProducts();
  if (!products) return;
  results.replaceChildren();
  if (!products.length) {
    appendEmptyState(results, "No products found", "Try a different search or price range.");
    return;
  }
  const visibleProducts = products.slice(0, visibleCount);
  appendProductGrid(results, visibleProducts);
  const count = makeElement("p", "results-count", `Showing ${visibleProducts.length} of ${products.length} products`);
  results.appendChild(count);
  if (visibleProducts.length < products.length) {
    results.appendChild(makeActionButton("Load more", "load-more", "button button-quiet load-more"));
  }
}

export async function renderProducts(container, selectedCategory = "", isCurrent = () => true) {
  container.replaceChildren();
  container.appendChild(makeHeading("The collection", "Shop all products", "Search and refine the collection to find your next favorite.", "h1"));
  addLoading(container);
  try {
    await loadCategoryNames();
    if (!isCurrent()) return;
  } catch (error) {
    if (!isCurrent()) return;
    const loading = container.querySelector(".catalog-status");
    addError(loading ? loading.parentElement : container, error, "retry-catalog");
    return;
  }
  container.replaceChildren(makeHeading("The collection", "Shop all products", "Search and refine the collection to find your next favorite.", "h1"));
  const filters = makeElement("form", "catalog-filters row g-2 g-md-3");
  filters.id = "product-filters";

  const searchColumn = makeElement("div", "col-12 col-md-6 col-lg-4");
  const searchLabel = makeElement("label", "visually-hidden", "Search products");
  searchLabel.htmlFor = "product-search";
  const search = makeElement("input", "form-control");
  search.type = "search";
  search.id = "product-search";
  search.placeholder = "Search by product name";
  search.autocomplete = "off";
  searchColumn.append(searchLabel, search);

  const categoryColumn = makeElement("div", "col-12 col-md-6 col-lg-3");
  const categoryLabel = makeElement("label", "visually-hidden", "Filter by category");
  categoryLabel.htmlFor = "product-category";
  const categorySelect = makeElement("select", "form-select");
  categorySelect.id = "product-category";
  categorySelect.appendChild(makeElement("option", "", "All categories"));
  categorySelect.options[0].value = "";
  categories.forEach((category) => {
    const option = makeElement("option", "", category);
    option.value = category;
    categorySelect.appendChild(option);
  });
  categorySelect.value = selectedCategory;
  categoryColumn.append(categoryLabel, categorySelect);

  const minColumn = makeElement("div", "col-6 col-md-3 col-lg-2");
  const minLabel = makeElement("label", "visually-hidden", "Minimum price");
  minLabel.htmlFor = "min-price";
  const minPrice = makeElement("input", "form-control");
  minPrice.id = "min-price";
  minPrice.type = "number";
  minPrice.min = "0";
  minPrice.step = "0.01";
  minPrice.placeholder = "Min price";
  minColumn.append(minLabel, minPrice);

  const maxColumn = makeElement("div", "col-6 col-md-3 col-lg-2");
  const maxLabel = makeElement("label", "visually-hidden", "Maximum price");
  maxLabel.htmlFor = "max-price";
  const maxPrice = makeElement("input", "form-control");
  maxPrice.id = "max-price";
  maxPrice.type = "number";
  maxPrice.min = "0";
  maxPrice.step = "0.01";
  maxPrice.placeholder = "Max price";
  maxColumn.append(maxLabel, maxPrice);

  const sortColumn = makeElement("div", "col-12 col-md-6 col-lg-3");
  const sortLabel = makeElement("label", "visually-hidden", "Sort products");
  sortLabel.htmlFor = "product-sort";
  const sort = makeElement("select", "form-select");
  sort.id = "product-sort";
  [
    ["featured", "Featured"],
    ["price-low", "Price: low to high"],
    ["price-high", "Price: high to low"],
    ["name", "Name: A to Z"],
  ].forEach(([value, label]) => {
    const option = makeElement("option", "", label);
    option.value = value;
    sort.appendChild(option);
  });
  sortColumn.append(sortLabel, sort);
  filters.append(searchColumn, categoryColumn, minColumn, maxColumn, sortColumn);
  filters.addEventListener("submit", (event) => event.preventDefault());
  container.appendChild(filters);

  const rangeError = makeElement("p", "filter-error hidden");
  rangeError.id = "price-range-error";
  rangeError.setAttribute("role", "alert");
  container.appendChild(rangeError);
  const results = makeElement("div");
  results.id = "product-results";
  addLoading(results);
  container.appendChild(results);

  try {
    let products;
    if (selectedCategory) products = await getManagedProductsByCategory(selectedCategory);
    else if (allProducts) products = allProducts;
    else {
      products = await getProducts();
      allProducts = products;
    }
    if (!isCurrent()) return;
    if (!Array.isArray(products)) throw new Error("The products response was not a list.");
    listingProducts = products;
    results.replaceChildren();
    visibleCount = PAGE_SIZE;
    updateListingGrid();
  } catch (error) {
    if (!isCurrent()) return;
    addError(results, error, "retry-catalog");
  }
}

export function updateProductListing() {
  updateListingGrid();
}

export async function renderProductDetails(container, productId, isCurrent = () => true) {
  container.replaceChildren();
  addLoading(container, "Loading product details...");
  try {
    const rawProduct = await getProductById(productId);
    if (!isCurrent()) return;
    if (!rawProduct || typeof rawProduct !== "object" || !rawProduct.title) {
      appendEmptyState(container, "Product not found", "This product may no longer be available.");
      return;
    }
    const product = displayProduct(rawProduct);
    container.replaceChildren();
    const back = makeActionButton("Back to products", "products", "button button-quiet detail-back");
    const layout = makeElement("article", "product-detail row g-4 g-lg-5");
    const imageColumn = makeElement("div", "col-12 col-md-5");
    const imageWrap = makeElement("div", "product-detail-image");
    const imageUrl = safeImageUrl(product.image);
    if (imageUrl) {
      const image = makeElement("img");
      image.src = imageUrl;
      image.alt = product.name;
      image.addEventListener("error", () => {
        image.replaceWith(makeElement("span", "product-image-placeholder", "Image unavailable"));
      }, { once: true });
      imageWrap.appendChild(image);
    } else imageWrap.appendChild(makeElement("span", "product-image-placeholder", "No image"));
    imageColumn.appendChild(imageWrap);

    const info = makeElement("div", "col-12 col-md-7 product-detail-info");
    info.append(
      makeElement("p", "eyebrow", product.category),
      makeElement("h1", "", product.name),
      makeElement("p", "product-detail-price", formatPrice(product.price)),
      makeElement("p", "product-detail-description", product.description),
    );
    const summary = getProductReviewSummary(product.id);
    info.appendChild(makeElement(
      "p",
      "product-rating",
      summary.count
        ? `★ ${summary.average.toFixed(1)} / 5 · ${summary.count} customer review${summary.count === 1 ? "" : "s"}`
        : "No customer reviews yet.",
    ));
    const actions = makeElement("div", "product-detail-actions");
    const addButton = makeActionButton("Add to bag", "add-cart", "button button-dark", product.id);
    if (Number.isInteger(product.stock) && product.stock >= 0) {
      addButton.dataset.stock = String(product.stock);
      const cartQuantity = getCart().find((line) => line.productId === product.id)?.quantity || 0;
      if (cartQuantity >= product.stock) {
        addButton.disabled = true;
        addButton.title = "No more tracked stock is available";
      }
    }
    actions.append(
      addButton,
      makeActionButton(
        getWishlist().includes(product.id) ? "Remove from wishlist" : "Add to wishlist",
        "toggle-wishlist",
        "button button-quiet",
        product.id,
      ),
    );
    info.appendChild(actions);
    layout.append(imageColumn, info);
    const reviewSection = renderReviewSection(product.id);
    container.append(back, layout, reviewSection);
  } catch (error) {
    if (!isCurrent()) return;
    addError(container, error, "retry-product-details");
  }

  function renderReviewSection(productId) {
    const section = makeElement("section", "reviews-section");
    section.append(
      makeElement("h2", "", "Customer reviews"),
      makeElement("p", "text-secondary", "Reviews are stored locally in this browser."),
    );
    try {
      const currentUser = getCurrentUser();
      const existing = currentUser?.role === "customer"
        ? getCustomerReview(productId, currentUser.id ?? currentUser.username)
        : null;
      const form = document.createElement("form");
      form.id = "review-form";
      form.dataset.productId = String(productId);
      form.className = "review-form";
      const ratingField = makeElement("div", "field");
      const ratingLabel = makeElement("label", "", "Your rating");
      ratingLabel.htmlFor = "review-rating";
      const rating = document.createElement("select");
      rating.id = "review-rating";
      rating.name = "rating";
      rating.className = "form-select";
      rating.required = true;
      for (let score = 5; score >= 1; score -= 1) {
        const option = makeElement("option", "", `${score} star${score === 1 ? "" : "s"}`);
        option.value = String(score);
        option.selected = existing?.rating === score;
        rating.appendChild(option);
      }
      ratingField.append(ratingLabel, rating);
      const commentField = makeElement("div", "field");
      const commentLabel = makeElement("label", "", "Written feedback");
      commentLabel.htmlFor = "review-comment";
      const comment = document.createElement("textarea");
      comment.id = "review-comment";
      comment.name = "comment";
      comment.className = "form-control";
      comment.required = true;
      comment.minLength = 5;
      comment.maxLength = 500;
      comment.value = existing?.comment || "";
      comment.placeholder = "Share what you thought about this product.";
      commentField.append(commentLabel, comment);
      form.append(ratingField, commentField);
      if (currentUser?.role === "customer") {
        const submit = makeElement("button", "button button-dark", existing ? "Update your review" : "Submit review");
        submit.type = "submit";
        form.appendChild(submit);
      } else {
        form.appendChild(makeElement("p", "alert alert-info", "Sign in with a customer account to leave a review."));
      }
      section.appendChild(form);
      const reviews = getReviewsForProduct(productId);
      if (!reviews.length) {
        section.appendChild(makeElement("p", "reviews-empty", "Be the first to review this product."));
      } else {
        const list = makeElement("div", "reviews-list");
        reviews.forEach((review) => {
          const card = makeElement("article", "review-card");
          card.append(
            makeElement("h3", "", `${review.rating} / 5 stars · ${review.customerName}`),
            makeElement("p", "review-date", new Date(review.createdAt).toLocaleDateString()),
            makeElement("p", "review-comment", review.comment),
          );
          list.appendChild(card);
        });
        section.appendChild(list);
      }
    } catch (error) {
      section.appendChild(makeElement("p", "alert alert-danger", error.message || "Reviews could not be loaded."));
    }
    return section;
  }
}

async function fetchProductsByIds(ids) {
  const results = await Promise.allSettled(ids.map((id) => getManagedProductById(id)));
  const products = [];
  let failures = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.title) products.push(result.value);
    else failures += 1;
  });
  return { products, failures };
}

export async function renderWishlist(container, isCurrent = () => true) {
  container.replaceChildren(makeHeading("Saved for later", "Your wishlist", "Keep the products you love close by.", "h1"));
  const ids = getWishlist();
  if (!ids.length) {
    appendEmptyState(container, "Your wishlist is waiting", "Save a product using its heart button.", "products", "Explore products");
    return;
  }
  const results = makeElement("div");
  addLoading(results, "Loading your saved products...");
  container.appendChild(results);
  try {
    const { products, failures } = await fetchProductsByIds(ids);
    if (!isCurrent()) return;
    results.replaceChildren();
    if (!products.length) {
      appendEmptyState(results, "Saved products are unavailable", "Try again when the catalog is reachable.", "retry-wishlist", "Try again");
      return;
    }
    if (failures) {
      const warning = makeElement("p", "alert alert-warning", `${failures} saved product${failures === 1 ? " is" : "s are"} currently unavailable.`);
      results.appendChild(warning);
    }
    appendProductGrid(results, products, ids, true);
  } catch (error) {
    if (!isCurrent()) return;
    addError(results, error, "retry-wishlist");
  }
}

export async function renderCart(container, isCurrent = () => true) {
  container.replaceChildren(makeHeading("Your selections", "Your bag", "Review the products you have added.", "h1"));
  const lines = getCart();
  if (!lines.length) {
    appendEmptyState(container, "Your bag is empty", "Browse the collection to find something you love.", "products", "Shop products");
    return;
  }
  const content = makeElement("div", "cart-layout");
  addLoading(content, "Loading your bag...");
  container.appendChild(content);
  try {
    const { products, failures } = await fetchProductsByIds(lines.map((line) => line.productId));
    if (!isCurrent()) return;
    content.replaceChildren();
    if (failures) {
      const warning = makeElement("p", "alert alert-warning", `${failures} cart item${failures === 1 ? " could not" : "s could not"} be loaded. Your saved quantity is unchanged.`);
      warning.setAttribute("role", "status");
      content.appendChild(warning);
    }
    const byId = new Map(products.map((product) => [String(product.id), product]));
    const list = makeElement("div", "cart-items");
    let subtotal = 0;
    let hasUnavailableItems = false;
    lines.forEach((line) => {
      const rawProduct = byId.get(line.productId);
      if (!rawProduct) {
        hasUnavailableItems = true;
        const unavailableRow = makeElement("article", "cart-row");
        unavailableRow.append(
          makeElement("div", "cart-thumb cart-thumb-placeholder", "—"),
          makeElement("div", "cart-item-details", `Product ${line.productId} is unavailable`),
          makeElement("span", "product-meta", `Quantity: ${line.quantity}`),
          makeActionButton("Remove", "remove-cart", "button button-quiet button-small", line.productId),
        );
        list.appendChild(unavailableRow);
        return;
      }
      const product = displayProduct(rawProduct);
      subtotal += product.price * line.quantity;
      const row = makeElement("article", "cart-row");
      const image = makeElement("img", "cart-thumb");
      image.src = safeImageUrl(product.image);
      image.alt = product.name;
      image.loading = "lazy";
      const details = makeElement("div", "cart-item-details");
      details.append(
        makeElement("h2", "", product.name),
        makeElement("p", "", formatPrice(product.price)),
        makeElement("p", "product-meta", `Subtotal: ${formatPrice(product.price * line.quantity)}`),
      );
      const quantity = makeElement("div", "quantity-controls");
      const decrease = makeActionButton("−", "decrease-cart", "quantity-button", product.id);
      decrease.setAttribute("aria-label", `Decrease ${product.name} quantity`);
      quantity.append(
        decrease,
        makeElement("span", "", String(line.quantity)),
      );
      const increase = makeActionButton("+", "increase-cart", "quantity-button", product.id);
      increase.setAttribute("aria-label", `Increase ${product.name} quantity`);
      if (Number.isInteger(product.stock) && product.stock >= 0) {
        increase.dataset.stock = String(product.stock);
      }
      if (Number.isInteger(product.stock) && product.stock >= 0 && line.quantity >= product.stock) {
        increase.disabled = true;
        increase.title = "No more tracked stock is available";
      }
      quantity.appendChild(increase);
      const remove = makeActionButton("Remove", "remove-cart", "button button-quiet button-small", product.id);
      row.append(image, details, quantity, remove);
      list.appendChild(row);
    });
    if (!list.childElementCount && !failures) {
      appendEmptyState(content, "Your bag is empty", "Browse the collection to find something you love.", "products", "Shop products");
      return;
    }
    content.appendChild(list);
    if (list.childElementCount) {
      const summary = makeElement("div", "cart-total");
      summary.append(makeElement("span", "", "Subtotal"), makeElement("strong", "", formatPrice(subtotal)));
      content.append(summary);
      const actions = makeElement("div", "form-actions");
      if (hasUnavailableItems) {
        actions.appendChild(makeElement("p", "alert alert-warning", "Remove unavailable products before checkout."));
      } else {
        actions.appendChild(makeActionButton("Continue to checkout", "checkout", "button button-dark"));
      }
      actions.appendChild(makeActionButton("Clear bag", "clear-cart", "button button-quiet"));
      content.append(actions);
    }
  } catch (error) {
    if (!isCurrent()) return;
    addError(content, error, "retry-cart");
  }
}

export async function handleShoppingAction(action, productId, stockValue) {
  if (["add-cart", "increase-cart", "move-wishlist-cart"].includes(action)) {
    const existing = getCart().find((item) => item.productId === String(productId));
    const nextQuantity = (existing?.quantity || 0) + 1;
    const stock = stockValue === undefined ? null : Number(stockValue);
    if (Number.isInteger(stock) && stock >= 0 && nextQuantity > stock) {
      throw new Error("You cannot add more than the available tracked inventory.");
    }
    if (action === "move-wishlist-cart") moveWishlistItemToCart(productId);
    else if (action === "add-cart") addToCart(productId);
    else changeCartQuantity(productId, 1);
  }
  else if (action === "toggle-wishlist") return toggleWishlist(productId);
  else if (action === "decrease-cart") changeCartQuantity(productId, -1);
  else if (action === "remove-cart") removeFromCart(productId);
  else if (action === "remove-wishlist") removeFromWishlist(productId);
  else if (action === "clear-cart") clearCart();
  return null;
}

export function loadMoreProducts() {
  visibleCount += PAGE_SIZE;
  updateListingGrid();
}
