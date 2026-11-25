import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

let inMemoryToken = null;
let onUnauthorizedCallback = null;

export function setAuthToken(token) {
  inMemoryToken = token || null;
}

export function getAuthToken() {
  return inMemoryToken;
}

export function registerUnauthorizedHandler(handler) {
  onUnauthorizedCallback = handler;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

api.interceptors.request.use((config) => {
  if (inMemoryToken) {
    config.headers.Authorization = `Bearer ${inMemoryToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const reqUrl = error?.config?.url || "";
    const isAuthProbe =
      reqUrl.includes("/auth/me") ||
      reqUrl.includes("/login") ||
      reqUrl.includes("/signup");

    if (status === 401 && !isAuthProbe && typeof onUnauthorizedCallback === "function") {
      onUnauthorizedCallback();
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (error?.code === "ECONNABORTED") {
    return "Request timed out. Please check your connection and try again.";
  }
  if (!error?.response) {
    return "Network error. Unable to reach the Travelogia server.";
  }
  return error.response.data?.message || error.response.data?.error || fallback;
}

export default api;
