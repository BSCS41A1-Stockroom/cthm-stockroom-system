import { Navigate, Routes, Route } from "react-router-dom";

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
import AuthorizationReview from "../pages/admin/AuthorizationReview";
import MobileQrScanner from "../pages/admin/MobileQrScanner";

// =========================================================
// OTHER PAGES
// =========================================================
import Login from "../pages/Login";
import SetPassword from "../pages/SetPassword";
import VerifyReceipt from "../pages/VerifyReceipt";
import ProfileSecurity from "../pages/ProfileSecurity";
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

                    <Route path="/student/profile" element={<ProfileSecurity />} />
                    <Route path="/my-qr" element={<Navigate to="/student/profile" replace />} />

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

                    <Route path="/professor/profile" element={<ProfileSecurity />} />
                    <Route path="/professor/signature" element={<Navigate to="/professor/profile" replace />} />

                    <Route
                        path="/authorize/:token"
                        element={<AuthorizationReview />}
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
                        roles={["staff", "department_head", "admin"]}
                    />
                }
            >

                <Route element={<ProtectedRoute roles={["staff", "admin"]} />}>
                    <Route path="/admin/scan/mobile" element={<MobileQrScanner />} />
                </Route>

                <Route element={<AdminLayout />}>

                    <Route element={<ProtectedRoute roles={["staff", "admin"]} />}>
                        <Route path="/admin" element={<Dashboard />} />
                        <Route path="/admin/calendar" element={<AdminCalendar />} />
                        <Route path="/admin/scan" element={<ScanQr />} />
                        <Route path="/admin/accountability" element={<Accountability />} />
                        <Route path="/admin/inventory" element={<Inventory />} />
                    </Route>

                    <Route element={<ProtectedRoute roles={["staff", "department_head", "admin"]} />}>
                        <Route path="/admin/requests" element={<Requests />} />
                        <Route path="/admin/reports" element={<Reports />} />
                        <Route path="/admin/profile" element={<ProfileSecurity />} />
                    </Route>

                    <Route element={<ProtectedRoute roles={["staff", "department_head"]} />}>
                        <Route path="/admin/signature" element={<Navigate to="/admin/profile" replace />} />
                    </Route>

                </Route>

            </Route>

            <Route element={<ProtectedRoute roles={["admin"]} />}>
                <Route element={<AdminLayout />}>
                    <Route path="/admin/activity-logs" element={<AuditLogs />} />
                    <Route path="/admin/users" element={<Users />} />
                </Route>
            </Route>

        </Routes>
    );
}
