# Northstar E-Commerce Demo

A responsive e-commerce demo built with HTML, CSS, Bootstrap 5.3, and vanilla
JavaScript ES modules. Product data comes from Fake Store API; customer shopping
data and orders are stored locally in the browser.

## Run locally

Open a terminal in this project folder and start a local server:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000>. An internet connection is needed for Bootstrap,
Bootstrap Icons, product images, and Fake Store API.

## Demo admin login

- **Email:** `admin@northstar.demo`
- **Password:** `NorthstarDemo!2026`

These are public demo credentials for this project only. Do not use them for a
real account. The admin role is enforced in the browser and is not secure
server-side authorization.

## Main features

- Product catalog, search, category and price filters, sorting, and details.
- Customer registration and email login.
- Customer-specific cart and wishlist.
- Checkout, local order history, and admin order decisions.
- Product management, custom categories, ratings, and return requests.
- Optional PayPal Sandbox continuation from an existing order.
- Admin Users tab showing local customer registrations and Fake Store API
  profiles. Passwords and password hashes are not displayed.

## Data and limitations

- New customer accounts, carts, wishlists, orders, reviews, returns, and
  management overrides are stored in this browser's local storage.
- Local browser data is not synced to a server or other devices and can be
  edited or removed by the browser user.
- Fake Store API is a demo API; successful write responses do not guarantee
  permanent changes.
- PayPal requires a Sandbox client ID in `js/config/paypal.js`. Never put a
  PayPal secret in frontend code. Production payments require a trusted backend.
- This project is for learning and demonstration, not production commerce.
