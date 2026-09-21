import { Suspense, lazy } from "react";
import { Navigate, Routes, Route } from "react-router-dom";

// =========================================================
// LAYOUTS
// =========================================================
const StudentLayout = lazy(() => import("../layouts/StudentLayout"));
const ProfessorLayout = lazy(() => import("../layouts/ProfessorLayout"));
const AdminLayout = lazy(() => import("../layouts/AdminLayout"));

// =========================================================
// STUDENT PAGES
// =========================================================
const Home = lazy(() => import("../pages/student/Home"));
const Borrowing = lazy(() => import("../pages/student/Borrowing"));
const Calendar = lazy(() => import("../pages/student/Calendar"));
const MyRequests = lazy(() => import("../pages/student/MyRequests"));
const Accountability = lazy(() => import("../pages/Accountability"));

// =========================================================
// PROFESSOR PAGES
// =========================================================
const ProfessorDashboard = lazy(() => import("../pages/professor/Dashboard"));
const ProfessorQRScanner = lazy(() => import("../pages/professor/QRScanner"));
const ProfessorCalendar = lazy(() => import("../pages/professor/Calendar"));
const ProfessorPendingRequests = lazy(() => import("../pages/professor/PendingRequests"));

// =========================================================
// ADMIN PAGES
// =========================================================
const Dashboard = lazy(() => import("../pages/admin/Dashboard"));
const Inventory = lazy(() => import("../pages/admin/Inventory"));
const Requests = lazy(() => import("../pages/admin/Requests"));
const AdminCalendar = lazy(() => import("../pages/admin/Calendar"));
const Reports = lazy(() => import("../pages/admin/Reports"));
const AuditLogs = lazy(() => import("../pages/admin/AuditLogs"));
const Users = lazy(() => import("../pages/admin/Users"));
const ScanQr = lazy(() => import("../pages/admin/ScanQr"));
const AuthorizationReview = lazy(() => import("../pages/admin/AuthorizationReview"));
const MobileQrScanner = lazy(() => import("../pages/admin/MobileQrScanner"));

// =========================================================
// OTHER PAGES
// =========================================================
const Login = lazy(() => import("../pages/Login"));
const SetPassword = lazy(() => import("../pages/SetPassword"));
const VerifyReceipt = lazy(() => import("../pages/VerifyReceipt"));
const ProfileSecurity = lazy(() => import("../pages/ProfileSecurity"));
import ProtectedRoute from "../auth/ProtectedRoute";


export default function AppRoutes() {
    return (
        <Suspense fallback={<div role="status" aria-live="polite" style={{ padding: "2rem", color: "#344154" }}>Loading page...</div>}>
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
        </Suspense>
    );
}
