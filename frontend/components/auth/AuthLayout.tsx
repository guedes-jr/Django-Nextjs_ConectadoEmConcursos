"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
