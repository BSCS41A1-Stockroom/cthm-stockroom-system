import { Routes, Route } from "react-router-dom";

// =========================================================
// LAYOUTS
// =========================================================
import StudentLayout from "../layouts/StudentLayout";
import ProfessorLayout from "../layouts/ProfessorLayout";
import AdminLayout from "../layouts/AdminLayout";

// =========================================================
// STUDENT PAGES
// =========================================================
import Home from "../pages/student/Home";
import Borrowing from "../pages/student/Borrowing";
import Calendar from "../pages/student/Calendar";
import MyRequests from "../pages/student/MyRequests";
import AccountQr from "../pages/student/AccountQr";
import Accountability from "../pages/Accountability";

// =========================================================
// PROFESSOR PAGES
// =========================================================
import ProfessorDashboard from "../pages/professor/Dashboard";
import ProfessorQRScanner from "../pages/professor/QRScanner";
import ProfessorCalendar from "../pages/professor/Calendar";
import ProfessorPendingRequests from "../pages/professor/PendingRequests";

// =========================================================
// ADMIN PAGES
// =========================================================
import Dashboard from "../pages/admin/Dashboard";
import Inventory from "../pages/admin/Inventory";
import Requests from "../pages/admin/Requests";
import AdminCalendar from "../pages/admin/Calendar";
import Reports from "../pages/admin/Reports";
import AuditLogs from "../pages/admin/AuditLogs";
import Users from "../pages/admin/Users";
import ScanQr from "../pages/admin/ScanQr";
import MobileQrScanner from "../pages/admin/MobileQrScanner";

// =========================================================
// OTHER PAGES
// =========================================================
import Login from "../pages/Login";
import SetPassword from "../pages/SetPassword";
import VerifyReceipt from "../pages/VerifyReceipt";
import ProtectedRoute from "../auth/ProtectedRoute";


export default function AppRoutes() {
    return (
        <Routes>

            {/* =================================================
                PUBLIC ROUTES
            ================================================= */}

            <Route
                path="/login"
                element={<Login />}
            />

            <Route
                path="/set-password"
                element={<SetPassword />}
            />

            <Route
                path="/verify-receipt"
                element={<VerifyReceipt />}
            />

            <Route
                path="/verify-receipt/:code"
                element={<VerifyReceipt />}
            />


            {/* =================================================
                STUDENT PORTAL
            ================================================= */}

            <Route
                element={
                    <ProtectedRoute
                        roles={["student"]}
                    />
                }
            >
                <Route element={<StudentLayout />}>

                    <Route
                        path="/"
                        element={<Home />}
                    />

                    <Route
                        path="/borrowing"
                        element={<Borrowing />}
                    />

                    <Route
                        path="/calendar"
                        element={<Calendar />}
                    />

                    <Route
                        path="/my-requests"
                        element={<MyRequests />}
                    />

                    <Route
                        path="/my-qr"
                        element={<AccountQr />}
                    />

                    <Route
                        path="/my-accountability"
                        element={<Accountability />}
                    />

                </Route>
            </Route>


            {/* =================================================
                PROFESSOR PORTAL
                PROFESSOR ONLY
            ================================================= */}

            <Route
                element={
                    <ProtectedRoute
                        roles={["professor"]}
                    />
                }
            >
                <Route element={<ProfessorLayout />}>

                    {/* Dashboard */}
                    <Route
                        path="/professor"
                        element={<ProfessorDashboard />}
                    />

                    {/* QR Scanner */}
                    <Route
                        path="/professor/qr"
                        element={<ProfessorQRScanner />}
                    />

                    {/* Calendar */}
                    <Route
                        path="/professor/calendar"
                        element={<ProfessorCalendar />}
                    />

                    {/* Pending Student Requests */}
                    <Route
                        path="/professor/requests"
                        element={<ProfessorPendingRequests />}
                    />

                </Route>
            </Route>


            {/* =================================================
                ADMIN PORTAL
                ADMIN ONLY
            ================================================= */}

            <Route
                element={
                    <ProtectedRoute
                        roles={["admin"]}
                    />
                }
            >

                {/* Mobile QR Scanner */}
                <Route
                    path="/admin/scan/mobile"
                    element={<MobileQrScanner />}
                />

                <Route element={<AdminLayout />}>

                    {/* Dashboard */}
                    <Route
                        path="/admin"
                        element={<Dashboard />}
                    />

                    {/* Requests */}
                    <Route
                        path="/admin/requests"
                        element={<Requests />}
                    />

                    {/* Calendar */}
                    <Route
                        path="/admin/calendar"
                        element={<AdminCalendar />}
                    />

                    {/* Reports */}
                    <Route
                        path="/admin/reports"
                        element={<Reports />}
                    />

                    {/* QR Scanner */}
                    <Route
                        path="/admin/scan"
                        element={<ScanQr />}
                    />

                    {/* Accountability */}
                    <Route
                        path="/admin/accountability"
                        element={<Accountability />}
                    />

                    {/* Inventory */}
                    <Route
                        path="/admin/inventory"
                        element={<Inventory />}
                    />

                    {/* Activity Logs */}
                    <Route
                        path="/admin/activity-logs"
                        element={<AuditLogs />}
                    />

                    {/* Users */}
                    <Route
                        path="/admin/users"
                        element={<Users />}
                    />

                </Route>

            </Route>

        </Routes>
    );
}