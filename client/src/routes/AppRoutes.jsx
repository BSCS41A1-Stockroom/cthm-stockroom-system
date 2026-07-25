import { Routes, Route } from "react-router-dom";

// Layouts
import StudentLayout from "../layouts/StudentLayout";
import AdminLayout from "../layouts/AdminLayout";

// Student Pages
import Home from "../pages/student/Home";
import Borrowing from "../pages/student/Borrowing";
import Calendar from "../pages/student/Calendar";
import MyRequests from "../pages/student/MyRequests";

// Admin Pages
import Dashboard from "../pages/admin/Dashboard";
import Inventory from "../pages/admin/Inventory";
import Requests from "../pages/admin/Requests";
import AdminCalendar from "../pages/admin/Calendar";
import Reports from "../pages/admin/Reports";

export default function AppRoutes() {
  return (
    <Routes>

      {/* =========================
          STUDENT
      ========================= */}
      <Route element={<StudentLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/borrowing" element={<Borrowing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/my-requests" element={<MyRequests />} />
      </Route>

      {/* =========================
          ADMIN
      ========================= */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/inventory" element={<Inventory />} />
        <Route path="/admin/requests" element={<Requests />} />
        <Route path="/admin/calendar" element={<AdminCalendar />} />
        <Route path="/admin/reports" element={<Reports />} />
      </Route>

    </Routes>
  );
}