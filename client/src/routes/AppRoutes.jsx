import { Routes, Route } from "react-router-dom";

// Layouts
import StudentLayout from "../layouts/StudentLayout";
import AdminLayout from "../layouts/AdminLayout";

// Student Pages
import Home from "../pages/student/Home";
import Borrowing from "../pages/student/Borrowing";
import Calendar from "../pages/student/Calendar";
import MyRequests from "../pages/student/MyRequests";
import AccountQr from "../pages/student/AccountQr";

// Admin Pages
import Dashboard from "../pages/admin/Dashboard";
import Inventory from "../pages/admin/Inventory";
import Requests from "../pages/admin/Requests";
import AdminCalendar from "../pages/admin/Calendar";
import Reports from "../pages/admin/Reports";
import AuditLogs from "../pages/admin/AuditLogs";
import Users from "../pages/admin/Users";
import ScanQr from "../pages/admin/ScanQr";
import Login from "../pages/Login";
import SetPassword from "../pages/SetPassword";
import ProtectedRoute from "../auth/ProtectedRoute";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* =========================
          STUDENT
      ========================= */}
      <Route element={<ProtectedRoute roles={["student"]} />}>
        <Route element={<StudentLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/borrowing" element={<Borrowing />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/my-requests" element={<MyRequests />} />
          <Route path="/my-qr" element={<AccountQr />} />
        </Route>
      </Route>

      {/* =========================
          ADMIN
      ========================= */}
      <Route element={<ProtectedRoute roles={["professor", "admin"]} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/requests" element={<Requests />} />
          <Route path="/admin/calendar" element={<AdminCalendar />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/scan" element={<ScanQr />} />
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/admin/inventory" element={<Inventory />} />
            <Route path="/admin/activity-logs" element={<AuditLogs />} />
            <Route path="/admin/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

    </Routes>
  );
}
