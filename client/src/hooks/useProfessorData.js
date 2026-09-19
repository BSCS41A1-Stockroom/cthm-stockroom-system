import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { mapProfessorData } from "../utils/professorData";

export default function useProfessorData() {
  const [data, setData] = useState(() => mapProfessorData());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [borrowingResponse, calendarResponse] = await Promise.all([
        authenticatedFetch("/api/borrowings"),
        authenticatedFetch("/api/calendar/events"),
      ]);
      const [borrowingBody, calendarBody] = await Promise.all([
        borrowingResponse.json().catch(() => ({})),
        calendarResponse.json().catch(() => ({})),
      ]);
      if (!borrowingResponse.ok) throw new Error(borrowingBody.message || "Unable to load borrowing requests.");
      if (!calendarResponse.ok) throw new Error(calendarBody.message || "Unable to load the calendar.");
      setData(mapProfessorData(calendarBody.events || [], borrowingBody.requests || []));
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Unable to load professor data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => reload(), 0);
    const channel = supabase.channel("professor-live-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests" }, () => reload({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_request_authorizations" }, () => reload({ quiet: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => reload({ quiet: true }))
      .subscribe();
    return () => { window.clearTimeout(timer); supabase.removeChannel(channel); };
  }, [reload]);

  return { ...data, loading, error, reload };
}
