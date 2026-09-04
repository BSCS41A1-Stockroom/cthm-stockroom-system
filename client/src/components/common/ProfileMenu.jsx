import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";

export default function ProfileMenu({ variant = "student" }) {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const name = profile?.full_name || "Account";
  const role = profile?.role || "user";

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`profile-menu profile-menu-${variant}`} ref={menuRef}>
      <button type="button" className={variant === "admin" ? "admin-profile" : "role-switch"}
        onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} title="Open account menu">
        {variant === "admin" && <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff`} alt="" />}
        <span className="profile-trigger-text"><strong>{name}</strong><small>{role}</small></span>
      </button>
      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-details"><strong>{name}</strong><span>{user?.email || profile?.student_id || role}</span></div>
          <button type="button" className="profile-signout" role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
