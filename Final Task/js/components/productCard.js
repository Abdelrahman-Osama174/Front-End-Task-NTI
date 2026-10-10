import { formatPrice, makeActionButton, makeElement, safeImageUrl } from "../utils/dom.js";
import { getCart } from "../services/shoppingState.js";
import { getProductReviewSummary } from "../services/reviews.js";

export function productCard(product, { wishlist = [], showMoveToCart = false } = {}) {
  const card = makeElement("article", "product-card h-100");
  const imageWrap = makeElement("div", "product-image-wrap");
  const imageUrl = safeImageUrl(product.image);
  if (imageUrl) {
    const image = makeElement("img", "product-image");
    image.src = imageUrl;
    image.alt = product.name;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.replaceWith(makeElement("span", "product-image-placeholder", "Image unavailable"));
    }, { once: true });
    imageWrap.appendChild(image);
  } else {
    imageWrap.appendChild(makeElement("span", "product-image-placeholder", "No image"));
  }

  const saved = wishlist.includes(product.id);
  const favorite = makeActionButton(
    "",
    "toggle-wishlist",
    `heart-button${saved ? " is-saved" : ""}`,
    product.id,
  );
  favorite.setAttribute("aria-label", `${saved ? "Remove from" : "Add to"} wishlist: ${product.name}`);
  favorite.title = saved ? "Remove from wishlist" : "Add to wishlist";
  favorite.setAttribute("aria-pressed", String(saved));
  favorite.appendChild(makeElement("i", `bi ${saved ? "bi-heart-fill" : "bi-heart"}`));
  imageWrap.appendChild(favorite);

  const info = makeElement("div", "product-info");
  const category = makeElement("p", "product-category", product.category);
  const title = makeElement("h3", "product-title", product.name);
  const description = makeElement("p", "product-description", product.description);
  const priceRating = makeElement("div", "product-price-row");
  priceRating.appendChild(makeElement("span", "product-price", formatPrice(product.price)));
  const reviewSummary = getProductReviewSummary(product.id);
  if (reviewSummary.count) {
    priceRating.appendChild(makeElement(
      "span",
      "product-stock",
      `★ ${reviewSummary.average.toFixed(1)} (${reviewSummary.count} reviews)`,
    ));
  } else if (product.rating) {
    priceRating.appendChild(makeElement(
      "span",
      "product-stock",
      `★ ${product.rating.rate} (${product.rating.count})`,
    ));
  }

  const actions = makeElement("div", "product-actions");
  const details = makeActionButton("View details", "product-details", "button button-quiet button-small", product.id);
  const cartLine = getCart().find((item) => item.productId === product.id);
  const addButton = makeActionButton(
    showMoveToCart ? "Move to bag" : cartLine ? `Add another · ${cartLine.quantity} in bag` : "Add to bag",
    showMoveToCart ? "move-wishlist-cart" : "add-cart",
    "button button-dark button-small",
    product.id,
  );
  if (Number.isInteger(product.stock) && product.stock >= 0) {
    addButton.dataset.stock = String(product.stock);
    if ((cartLine?.quantity || 0) >= product.stock) {
      addButton.disabled = true;
      addButton.title = "No more tracked stock is available";
    }
  }
  if (showMoveToCart) {
    actions.append(details, addButton);
  } else {
    actions.append(details, addButton);
  }
  info.append(category, title, description, priceRating, actions);
  card.append(imageWrap, info);
  return card;
}
