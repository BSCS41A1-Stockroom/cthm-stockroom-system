import { useCallback, useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { authenticatedFetch } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import "../../styles/notifications.css";

export default function NotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const requestSequence = useRef(0);
  const realtimeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const response = await authenticatedFetch("/api/notifications");
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load notifications.");
      if (sequence === requestSequence.current) {
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setError("");
      }
    } catch (requestError) {
      if (sequence === requestSequence.current) setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    const timer = window.setTimeout(refresh, 0);
    const scheduleRefresh = () => {
      window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(refresh, 100);
    };
    const channel = supabase.channel(`notifications-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` }, scheduleRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` }, scheduleRefresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(realtimeTimer.current);
      requestSequence.current += 1;
      supabase.removeChannel(channel);
    };
  }, [refresh, user?.id]);

  useEffect(() => {
    function closeOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  async function markRead(notification) {
    try {
      if (!notification.read_at) {
        const response = await authenticatedFetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
        if (!response.ok) throw new Error("Unable to mark the notification as read.");
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setError("");
      setOpen(false);
      if (notification.related_path) navigate(notification.related_path);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function markAllRead() {
    try {
      const response = await authenticatedFetch("/api/notifications/read-all", { method: "PATCH" });
      if (!response.ok) throw new Error("Unable to mark notifications as read.");
      const now = new Date().toISOString();
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || now })));
      setUnreadCount(0);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return <div className="notification-center" ref={panelRef}>
    <button type="button" className="notification-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <FiBell />{unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section className="notification-panel">
      <header><div><h3>Notifications</h3><span>{unreadCount} unread</span></div>{unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}</header>
      {error && <p className="notification-state error">{error} <button type="button" onClick={refresh}>Retry</button></p>}
      <div className="notification-list">
        {notifications.map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.read_at ? "" : "unread"}`} onClick={() => markRead(notification)}>
          <span className="notification-indicator"/><span><strong>{notification.title}</strong><p>{notification.message}</p><time>{new Date(notification.created_at).toLocaleString()}</time></span>
        </button>)}
        {!error && notifications.length === 0 && <p className="notification-state">No notifications yet.</p>}
      </div>
    </section>}
  </div>;
}
