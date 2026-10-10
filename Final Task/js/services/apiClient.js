import { API_CONFIG } from "../config/api.js";

export class ApiError extends Error {
  constructor(message, { status = null, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
  }
}

function endpointUrl(path) {
  const baseUrl = API_CONFIG.baseUrl.replace(/\/+$/, "");
  const endpoint = String(path).replace(/^\/+/, "");
  return `${baseUrl}/${endpoint}`;
}

function errorMessageFromBody(body) {
  if (body && typeof body === "object" && typeof body.message === "string") {
    return body.message;
  }
  if (typeof body === "string" && body.trim()) return body.trim();
  return "";
}

export async function request(
  path,
  { method = "GET", body, signal, timeoutMs = API_CONFIG.timeoutMs } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const createAbortError = (cause) =>
    new ApiError(
      timedOut
        ? `The request timed out after ${timeoutMs} ms.`
        : "The request was cancelled.",
      { cause },
    );
  const abortFromCaller = () => controller.abort(signal.reason);

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const headers = new Headers({ Accept: "application/json" });
  const options = {
    method,
    headers,
    signal: controller.signal,
  };
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(body);
  }

  try {
    let response;
    try {
      response = await fetch(endpointUrl(path), options);
    } catch (error) {
      if (controller.signal.aborted) {
        throw createAbortError(error);
      }
      throw new ApiError("Unable to reach the Fake Store API. Check your connection and try again.", {
        cause: error,
      });
    }

    let responseText;
    try {
      responseText = await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw createAbortError(error);
      }
      throw new ApiError("Unable to read the Fake Store API response.", {
        cause: error,
      });
    }
    let data = null;
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        if (response.ok) {
          throw new ApiError("The Fake Store API returned an invalid JSON response.", {
            status: response.status,
            cause: error,
          });
        }
      }
    }

    if (!response.ok) {
      const detail = errorMessageFromBody(data);
      throw new ApiError(
        detail
          ? `Fake Store API request failed (${response.status}): ${detail}`
          : `Fake Store API request failed with status ${response.status}.`,
        { status: response.status },
      );
    }

    if (data === null && response.status !== 204) {
      throw new ApiError("The Fake Store API returned an empty response.", {
        status: response.status,
      });
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export const apiClient = Object.freeze({
  request,
});
