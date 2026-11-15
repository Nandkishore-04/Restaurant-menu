"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSupabase } from "./supabase";

/** Subscribe to an API broadcast channel; any event just triggers a refetch. */
export function useLiveChannel(channel: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !channel) return;
    const sub = supabase
      .channel(channel)
      .on("broadcast", { event: "*" }, () => {
        void queryClient.invalidateQueries();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(sub);
    };
  }, [channel, queryClient]);
}
