import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

export function useReportData(from, to) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const responseText = await response.text();
      let result = {};
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(response.ok ? "The server returned an invalid response." : "Unable to load report data.");
      }
      if (!response.ok) throw new Error(result.reasons?.[0] || result.message || "Unable to load report data.");
      if (sequence === requestSequence.current) {
        setData(result);
        setError("");
      }
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    const channel = supabase
      .channel(`reporting-${from}-${to}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_request_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, refresh)
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [from, refresh, to]);

  const dataMatchesRange = data?.range?.from === from && data?.range?.to === to;
  return { data: dataMatchesRange ? data : null, loading, error, refresh };
}
