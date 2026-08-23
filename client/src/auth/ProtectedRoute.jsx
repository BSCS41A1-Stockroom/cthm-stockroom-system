import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function ProtectedRoute({ roles }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-state">Loading your account...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <div className="auth-state auth-error">Your account profile is not configured. Contact an administrator.</div>;
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={profile.role === "student" ? "/" : "/admin"} replace />;
  }

  return <Outlet />;
}
