import { PAYPAL_CONFIG } from "../config/paypal.js";

let sdkPromise;

export function isPayPalConfigured() {
  const clientId = PAYPAL_CONFIG.clientId.trim();
  return Boolean(clientId && clientId !== "YOUR_SANDBOX_CLIENT_ID");
}

export function loadPayPalSdk() {
  if (!isPayPalConfigured()) {
    return Promise.reject(new Error("PayPal Sandbox is not configured. Add a sandbox client ID in js/config/paypal.js."));
  }
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const url = new URL("https://www.paypal.com/sdk/js");
    url.searchParams.set("client-id", PAYPAL_CONFIG.clientId.trim());
    url.searchParams.set("currency", PAYPAL_CONFIG.currency);
    url.searchParams.set("intent", "capture");
    script.src = url.href;
    script.async = true;
    script.dataset.paypalSdk = "true";
    script.onload = () => {
      if (window.paypal?.Buttons) resolve(window.paypal);
      else reject(new Error("PayPal Sandbox loaded without its Buttons API."));
    };
    script.onerror = () => reject(new Error("Could not load the PayPal Sandbox SDK. Check the client ID and network connection."));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
