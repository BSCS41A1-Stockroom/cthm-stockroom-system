export const REQUEST_STAGES = Object.freeze({
  PROFESSOR: "waiting_professor",
  STAFF: "waiting_staff",
  DEPARTMENT_HEAD: "waiting_department_head",
  READY: "ready_for_claim",
  BORROWED: "borrowed",
  RETURNED: "returned",
  REJECTED: "rejected",
  EXPIRED: "expired",
  WITHDRAWN: "withdrawn",
  CANCELLED: "cancelled",
});

export function requestStage(request = {}) {
  const status = String(request.status ?? "").toLowerCase();
  if (status === "pending") return REQUEST_STAGES.PROFESSOR;
  if (status === "validated") {
    return request.custodianVerifiedAt || request.custodian_verified_at
      ? REQUEST_STAGES.DEPARTMENT_HEAD
      : REQUEST_STAGES.STAFF;
  }
  if (status === "approved") return REQUEST_STAGES.READY;
  if (status === "borrowed") return REQUEST_STAGES.BORROWED;
  if (status === "returned") return REQUEST_STAGES.RETURNED;
  if (status === "rejected") return REQUEST_STAGES.REJECTED;
  if (status === "expired") return REQUEST_STAGES.EXPIRED;
  if (status === "withdrawn") return REQUEST_STAGES.WITHDRAWN;
  if (status === "cancelled") return REQUEST_STAGES.CANCELLED;
  return status || "unknown";
}

export function stageLabel(request) {
  return ({
    [REQUEST_STAGES.PROFESSOR]: "Waiting for Professor",
    [REQUEST_STAGES.STAFF]: "Waiting for Staff",
    [REQUEST_STAGES.DEPARTMENT_HEAD]: "Waiting for Custodian Head",
    [REQUEST_STAGES.READY]: "Ready for Claim",
    [REQUEST_STAGES.BORROWED]: "Borrowed",
    [REQUEST_STAGES.RETURNED]: "Returned",
    [REQUEST_STAGES.REJECTED]: "Rejected",
    [REQUEST_STAGES.EXPIRED]: "Expired",
    [REQUEST_STAGES.WITHDRAWN]: "Withdrawn",
    [REQUEST_STAGES.CANCELLED]: "Cancelled",
  })[requestStage(request)] || "Unknown";
}

export function isInRoleQueue(request, role) {
  const stage = requestStage(request);
  if (role === "professor") return stage === REQUEST_STAGES.PROFESSOR;
  if (role === "admin") return stage === REQUEST_STAGES.DEPARTMENT_HEAD;
  if (role === "staff") return [REQUEST_STAGES.STAFF, REQUEST_STAGES.READY, REQUEST_STAGES.BORROWED].includes(stage);
  return false;
}
