"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AdminListResult<T> = {results: T[]; count: number; page: number; overview: Record<string, number>; can_manage?: boolean; permissions?: Record<string,boolean>};
export function adminError(error: unknown, fallback: string) {
  const data = (error as {response?: {data?: Record<string, unknown>}})?.response?.data;
  return data && typeof data === "object" ? Object.entries(data).map(([key, value]) => `${key === "detail" ? "" : `${key}: `}${Array.isArray(value) ? value.join(" ") : value}`).join(" · ") || fallback : fallback;
}

export function useAdminListing<T>(defaults: Record<string, string>, fetchPage: (params: Record<string, string>) => Promise<AdminListResult<T>>) {
  const [query, setQuery] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<AdminListResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const next = {...defaults};
      Object.keys(defaults).forEach(key => { if (params.has(key)) next[key] = params.get(key)!; });
      if (!Number.isSafeInteger(Number(next.page)) || Number(next.page) < 1) next.page = "1";
      if (!["12", "24", "48"].includes(next.page_size)) next.page_size = "12";
      setQuery(next); setReady(true);
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [defaults]);
  const reload = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchPage(query);
      if (id !== sequence.current) return;
      setData(result); setForbidden(false);
      if (String(result.page) !== query.page) setQuery(current => ({...current, page: String(result.page)}));
    } catch (err) {
      if (id !== sequence.current) return;
      setError(adminError(err, "Não foi possível carregar os registros."));
      setForbidden((err as {response?: {status?: number}})?.response?.status === 403);
    } finally { if (id === sequence.current) setLoading(false); }
  }, [query, fetchPage]);
  useEffect(() => {
    if (!ready) return;
    const ref = sequence;
    ++ref.current; setLoading(true);
    const params = new URLSearchParams(window.location.search);
    Object.entries(query).forEach(([key, value]) => value === defaults[key] ? params.delete(key) : params.set(key, value));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    const timer = window.setTimeout(() => void reload(), 300);
    return () => { window.clearTimeout(timer); ++ref.current; };
  }, [ready, query, reload, defaults]);
  const change = (key: string, value: string) => setQuery(current => ({...current, [key]: value, ...(key === "page" ? {} : {page: "1"})}));
  const clear = () => setQuery(current => ({...defaults, ordering: current.ordering, page_size: current.page_size}));
  const hasFilters = Object.keys(defaults).some(key => !["page", "page_size", "ordering"].includes(key) && query[key] !== defaults[key]);
  return {query, data, loading, error, forbidden, reload, change, clear, hasFilters};
}
