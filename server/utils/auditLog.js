"use strict";

async function writeAuditLog(client, actor, entry) {
  if (!client || !entry?.action || !entry?.entityType) {
    throw new TypeError("An audit client, action, and entity type are required.");
  }
  await client.query(
    `INSERT INTO public.audit_logs
      (actor_user_id, actor_email, actor_name, actor_role, action, entity_type,
       entity_id, old_values, new_values, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)`,
    [
      actor?.id ?? null,
      actor?.email ?? null,
      actor?.full_name ?? null,
      actor?.role ?? null,
      entry.action,
      entry.entityType,
      entry.entityId == null ? null : String(entry.entityId),
      entry.oldValues == null ? null : JSON.stringify(entry.oldValues),
      entry.newValues == null ? null : JSON.stringify(entry.newValues),
      JSON.stringify(entry.metadata ?? {}),
    ]
  );
}

module.exports = { writeAuditLog };
