const STORAGE_KEY = "northstar-product-reviews-v1";

function readReviews() {
  let serialized;
  try {
    serialized = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Product reviews are unavailable in this browser.");
  }
  if (!serialized) return [];
  try {
    const reviews = JSON.parse(serialized);
    if (
      !Array.isArray(reviews) ||
      reviews.some(
        (review) =>
          !review ||
          typeof review.id !== "string" ||
          typeof review.productId !== "string" ||
          typeof review.customerId !== "string" ||
          typeof review.customerName !== "string" ||
          !Number.isInteger(review.rating) ||
          review.rating < 1 ||
          review.rating > 5 ||
          typeof review.comment !== "string" ||
          review.comment.length < 5 ||
          review.comment.length > 500 ||
          typeof review.createdAt !== "string" ||
          !Number.isFinite(Date.parse(review.createdAt)),
      )
    ) {
      throw new Error("Invalid review data.");
    }
    return reviews;
  } catch {
    throw new Error("Saved reviews are invalid. Clear the northstar-product-reviews-v1 entry to restart.");
  }
}

function saveReviews(reviews) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  } catch {
    throw new Error("Could not save your product review in this browser.");
  }
}

export function getReviewsForProduct(productId) {
  return readReviews()
    .filter((review) => review.productId === String(productId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getProductReviewSummary(productId) {
  const reviews = getReviewsForProduct(productId);
  return {
    count: reviews.length,
    average: reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null,
  };
}

export function getCustomerReview(productId, customerId) {
  return readReviews().find(
    (review) =>
      review.productId === String(productId) &&
      review.customerId === String(customerId),
  ) || null;
}

export function submitProductReview({ productId, customer, rating, comment }) {
  const normalizedRating = Number(rating);
  const normalizedComment = String(comment || "").trim();
  if (!productId || !customer || customer.id === undefined || customer.id === null) {
    throw new Error("Sign in with a customer account before submitting a review.");
  }
  if (customer.role !== "customer") throw new Error("Only customer accounts can submit product reviews.");
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error("Choose a rating from 1 to 5 stars.");
  }
  if (normalizedComment.length < 5 || normalizedComment.length > 500) {
    throw new Error("Feedback must contain 5–500 characters.");
  }

  const reviews = readReviews();
  const existing = reviews.find(
    (review) =>
      review.productId === String(productId) &&
      review.customerId === String(customer.id),
  );
  const now = new Date().toISOString();
  if (existing) {
    existing.rating = normalizedRating;
    existing.comment = normalizedComment;
    existing.customerName = String(customer.name || customer.username);
    existing.updatedAt = now;
    saveReviews(reviews);
    return { review: existing, updated: true };
  }
  const review = {
    id: `RV-${crypto.randomUUID()}`,
    productId: String(productId),
    customerId: String(customer.id),
    customerName: String(customer.name || customer.username),
    rating: normalizedRating,
    comment: normalizedComment,
    createdAt: now,
    updatedAt: null,
  };
  saveReviews([review, ...reviews]);
  return { review, updated: false };
}
