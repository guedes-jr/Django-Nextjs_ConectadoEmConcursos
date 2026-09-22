"use client";

import { useCallback, useEffect, useState } from "react";
import { http } from "@/lib/http";

export type Me = {
  id: number;
  email: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar?: string | null;
  social_avatar?: string | null;
  phone: string;
  state: string;
  city: string;
  profession: string;
  target_role: string;
  study_hours_per_day: number;
  disciplines: string[];
};

type UseMeResult = {
  me: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
};

export function useMe(): UseMeResult {
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await http.get<Me>("/api/me/");
      setMe(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setMe(null);
      } else {
        console.error("useMe error:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    me,
    isLoading,
    isAuthenticated: !isLoading && me !== null,
    refresh,
  };
}
