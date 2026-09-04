import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/useAuth";

export default function ProfileMenu({ variant = "student" }) {
  const { user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const menuRef = useRef(null);
  const name = profile?.full_name || "Account";
  const role = profile?.role || "user";

  useEffect(() => {
    if (!open && !confirmingSignOut) return undefined;
    const closeOutside = (event) => {
      if (open && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !signingOut) {
        setOpen(false);
        setConfirmingSignOut(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, confirmingSignOut, signingOut]);

  const requestSignOut = () => {
    setOpen(false);
    setSignOutError("");
    setConfirmingSignOut(true);
  };

  const confirmSignOut = async () => {
    setSigningOut(true);
    setSignOutError("");
    const { error } = await signOut();
    if (error) {
      setSignOutError(error.message || "Unable to sign out. Please try again.");
      setSigningOut(false);
      return;
    }
    setConfirmingSignOut(false);
  };

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
          <button type="button" className="profile-signout" role="menuitem" onClick={requestSignOut}>Sign out</button>
        </div>
      )}
      {confirmingSignOut && (
        <div className="signout-confirm-overlay" role="presentation">
          <div className="signout-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-confirm-title">
            <h3 id="signout-confirm-title">Sign out?</h3>
            <p>Are you sure you want to sign out of your account?</p>
            {signOutError && <p className="signout-confirm-error">{signOutError}</p>}
            <div className="signout-confirm-actions">
              <button type="button" className="signout-cancel" disabled={signingOut} onClick={() => setConfirmingSignOut(false)}>Cancel</button>
              <button type="button" className="signout-submit" disabled={signingOut} onClick={confirmSignOut}>
                {signingOut ? "Signing out..." : "Yes, sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
