import { http } from "@/lib/http";

export async function getCurrentUser() {
  return http.get("/api/auth/user/");
}
