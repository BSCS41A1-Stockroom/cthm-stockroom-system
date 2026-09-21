export function normalizeRole(role) {
  if (!role) return null;
  return String(role).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function getRoleDestination(role) {
  switch (normalizeRole(role)) {
    case "student":
      return "/";
    case "professor":
    case "faculty":
    case "teacher":
      return "/professor";
    case "staff":
    case "custodian":
      return "/admin";
    case "departmenthead":
      return "/admin/requests";
    case "admin":
    case "administrator":
      return "/admin";
    default:
      return null;
  }
}

export function canResumeDestination(role, destination) {
  if (!destination) return false;
  const normalizedRole = normalizeRole(role);

  if (["professor", "faculty", "teacher"].includes(normalizedRole)) {
    return destination === "/professor" || destination.startsWith("/professor/") || destination.startsWith("/authorize/");
  }
  if (normalizedRole === "student") {
    return destination === "/" || ["/borrowing", "/calendar", "/my-requests", "/my-qr", "/my-accountability", "/student/profile"]
      .some((path) => destination === path || destination.startsWith(`${path}/`));
  }
  if (["staff", "custodian", "departmenthead", "admin", "administrator"].includes(normalizedRole)) {
    return destination === "/admin" || destination.startsWith("/admin/");
  }
  return false;
}
