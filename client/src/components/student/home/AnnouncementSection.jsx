import { useCallback, useEffect, useState } from "react";
import { FaBullhorn } from "react-icons/fa";
import { authenticatedFetch } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

function announcementDate(value) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric",
  }).format(new Date(value));
}

export default function AnnouncementSection() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnnouncements = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/announcements");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load announcements.");
      setAnnouncements(result.announcements || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadAnnouncements, 0);
    const channel = supabase.channel("student-home-announcements")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadAnnouncements)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadAnnouncements]);

  return (
    <section className="announcement-section">
      <div className="announcement-header"><div><span>NOTICE BOARD</span><h2>Latest Announcements</h2></div></div>
      <div className="announcement-list">
        {loading && <p className="announcement-empty">Loading announcements...</p>}
        {!loading && error && <p className="announcement-empty form-error">{error}</p>}
        {!loading && !error && announcements.length === 0 && <p className="announcement-empty">No announcements have been published.</p>}
        {announcements.map((item) => (
          <article className="announcement-card" key={item.id}>
            <div className="announcement-icon"><FaBullhorn /></div>
            <div className="announcement-content">
              <div className="announcement-meta"><span>ANNOUNCEMENT</span><time dateTime={item.published_at}>{announcementDate(item.published_at)}</time></div>
              <h3>{item.title}</h3><p>{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
