"use strict";

const pool = require("../config/db");

const PAGE_SIZE = 25;
const ACTION_PATTERN = /^[a-z0-9_]{1,80}$/;

function normalizeAuditFilters(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const action = typeof query.action === "string" && ACTION_PATTERN.test(query.action) ? query.action : "";
  const entityType = typeof query.entityType === "string" && ACTION_PATTERN.test(query.entityType) ? query.entityType : "";
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";
  return { page, action, entityType, search };
}

async function listAuditLogs(req, res, next) {
  const filters = normalizeAuditFilters(req.query);
  const values = [filters.action, filters.entityType, filters.search, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE];
  try {
    const result = await pool.query(
      `SELECT id, actor_user_id, actor_email, actor_name, actor_role, action,
              entity_type, entity_id, old_values, new_values, metadata, created_at,
              count(*) over()::integer AS total_count
         FROM public.audit_logs
        WHERE ($1 = '' OR action = $1)
          AND ($2 = '' OR entity_type = $2)
          AND ($3 = '' OR actor_name ILIKE '%' || $3 || '%'
               OR actor_email ILIKE '%' || $3 || '%'
               OR entity_id ILIKE '%' || $3 || '%')
        ORDER BY created_at DESC, id DESC
        LIMIT $4 OFFSET $5`,
      values
    );
    return res.json({
      logs: result.rows.map(({ total_count, ...row }) => row),
      pagination: { page: filters.page, pageSize: PAGE_SIZE, total: result.rows[0]?.total_count ?? 0 },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listAuditLogs, normalizeAuditFilters };
