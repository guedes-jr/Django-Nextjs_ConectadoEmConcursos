import axios from "axios";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000",
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  const csrf = getCookie("csrftoken");
  if (csrf) {
    config.headers = config.headers ?? {};
    config.headers["X-CSRFToken"] = csrf;
  }
  return config;
});
