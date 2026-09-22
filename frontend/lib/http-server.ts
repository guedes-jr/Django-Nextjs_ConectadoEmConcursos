import axios from "axios";
import { cookies } from "next/headers";

export function createServerHttp() {
  const cookieHeader = cookies().toString();

  return axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    withCredentials: true,
  });
}
