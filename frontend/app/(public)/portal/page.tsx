"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { adminUrl } from "@/lib/admin";
import { useMe } from "@/lib/useMe";

export default function PortalPage() {
  const router = useRouter();
  const { me, isLoading, isAuthenticated } = useMe();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (me?.is_staff) {
      window.location.assign(adminUrl());
      return;
    }
    router.replace("/dashboard");
  }, [me, isLoading, isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <Image src="/logos/logo.png" alt="Conectado em Concursos" width={48} height={48} className="object-cover" />
        </div>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin text-blue-600" />
          Redirecionando para o seu painel...
        </p>
      </div>
    </main>
  );
}