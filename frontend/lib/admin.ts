export const adminBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function backendUrl(path = "") {
  const clean = path.replace(/^\/+/, "");
  return `${adminBaseUrl.replace(/\/+$/, "")}/${clean}`;
}

export function adminUrl(path = "") {
  return backendUrl(`admin/${path}`.replace(/^\/+/, ""));
}