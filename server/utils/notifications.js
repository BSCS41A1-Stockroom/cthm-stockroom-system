"use strict";

function notificationValues(entry) {
  if (!entry?.type || !entry?.title || !entry?.message) throw new TypeError("Notification type, title, and message are required.");
  return [entry.type, entry.title, entry.message, entry.relatedPath ?? null, entry.entityType ?? null,
    entry.entityId == null ? null : String(entry.entityId)];
}

async function notifyUser(client, recipientUserId, entry) {
  if (!recipientUserId) return;
  await client.query(
    `INSERT INTO public.notifications
      (recipient_user_id, type, title, message, related_path, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [recipientUserId, ...notificationValues(entry)]
  );
}

async function notifyRoles(client, roles, entry) {
  if (!Array.isArray(roles) || roles.length === 0) return;
  await client.query(
    `INSERT INTO public.notifications
      (recipient_user_id, type, title, message, related_path, entity_type, entity_id)
     SELECT user_id, $2, $3, $4, $5, $6, $7 FROM public.profiles WHERE role = ANY($1::text[]) AND is_active = true`,
    [roles, ...notificationValues(entry)]
  );
}

async function notifyDepartmentRole(client, departmentId, role, entry) {
  if (!departmentId || !role) return;
  await client.query(
    `INSERT INTO public.notifications
      (recipient_user_id, type, title, message, related_path, entity_type, entity_id)
     SELECT user_id, $3, $4, $5, $6, $7, $8 FROM public.profiles
      WHERE department_id=$1 AND role=$2 AND is_active=true`,
    [departmentId, role, ...notificationValues(entry)]
  );
}

module.exports = { notificationValues, notifyDepartmentRole, notifyRoles, notifyUser };
