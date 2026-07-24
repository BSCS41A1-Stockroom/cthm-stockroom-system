import { Routes, Route } from "react-router-dom";

import StudentLayout from "../layouts/StudentLayout";

import Home from "../pages/student/Home";
import Borrowing from "../pages/student/Borrowing";
import Calendar from "../pages/student/Calendar";
import MyRequests from "../pages/student/MyRequests";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<StudentLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/borrowing" element={<Borrowing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/my-requests" element={<MyRequests />} />
      </Route>
    </Routes>
  );
}