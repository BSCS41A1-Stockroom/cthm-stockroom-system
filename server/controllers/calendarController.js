"use strict";

const pool = require("../config/db");
const { dateInTimeZone, intervalsOverlap, parseTime } = require("../algorithms/csp");
const { isValidDate } = require("../algorithms/borrowingValidation");
const { writeAuditLog } = require("../utils/auditLog");
const { findClosure } = require("../utils/calendarClosures");

const EVENT_TYPES = new Set(["activity", "holiday", "reminder", "borrowing"]);

function normalizeEvent(body) {
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    date: body.date ?? body.event_date,
    start: body.start ?? body.start_time ?? "",
    end: body.end ?? body.end_time ?? "",
    type: body.type ?? body.event_type ?? "activity",
    description: typeof body.description === "string" ? body.description.trim() : "",
    roomId: body.roomId ?? body.room_id ?? null,
  };
}

function basicEventErrors(event, now = new Date()) {
  const errors = [];
  if (!event.title) errors.push("Event title is required.");
  if (!isValidDate(event.date)) errors.push("A valid event date is required.");
  if (isValidDate(event.date) && event.date < dateInTimeZone(now, "Asia/Manila")) {
    errors.push("Calendar events cannot be scheduled in the past.");
  }
  if (!EVENT_TYPES.has(event.type)) errors.push("Event type is invalid.");
  if (Boolean(event.start) !== Boolean(event.end)) errors.push("Start and end time must both be provided.");
  if (event.roomId && (!event.start || !event.end)) errors.push("Room events require a start and end time.");
  if (event.start && event.end) {
    try {
      const start = parseTime(event.start.slice(0, 5), "start", 30);
      const end = parseTime(event.end.slice(0, 5), "end", 30);
      if (start >= end) errors.push("End time must be after start time.");
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

async function validateRoomSchedule(client, event, excludedEventId = null) {
  const errors = basicEventErrors(event);
  if (errors.length || !event.roomId) return errors;

  // Row locks cannot protect an empty time range. Serializing checks for the
  // same room and date prevents concurrent inserts from both seeing no clash.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`calendar-room:${String(event.roomId)}:${event.date}`]
  );

  const roomResult = await client.query(
    `SELECT id, room_type, capacity, features
       FROM laboratory_rooms
      WHERE id = $1 AND is_active = true`,
    [event.roomId]
  );
  if (roomResult.rowCount === 0) return [...errors, "The selected laboratory room is unavailable."];

  const existingResult = await client.query(
    `SELECT id, room_id, event_date, start_time, end_time
       FROM calendar_events
      WHERE room_id = $1
        AND event_date = $2::date
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND ($3::bigint IS NULL OR id <> $3::bigint)
      FOR UPDATE`,
    [event.roomId, event.date, excludedEventId]
  );

  const startMinutes = parseTime(event.start.slice(0, 5), "start");
  const endMinutes = parseTime(event.end.slice(0, 5), "end");
  const hasOverlap = existingResult.rows.some((booking) => intervalsOverlap(
    startMinutes,
    endMinutes,
    parseTime(String(booking.start_time).slice(0, 5), "existing start"),
    parseTime(String(booking.end_time).slice(0, 5), "existing end")
  ));

  if (hasOverlap) {
    return [...errors, "The selected room is already booked during this time."];
  }
  return errors;
}

async function listEvents(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT events.*, rooms.name AS room_name
         FROM calendar_events events
         LEFT JOIN laboratory_rooms rooms ON rooms.id = events.room_id
         LEFT JOIN borrow_requests request ON request.id=events.borrow_request_id
        WHERE ($1::boolean=false OR (events.room_id IS NULL AND events.borrow_request_id IS NULL)
          OR rooms.department_id=$2::bigint OR request.department_id=$2::bigint)
        ORDER BY events.event_date, events.start_time NULLS FIRST, events.id`
      , [req.user.role === "staff", req.user.department_id]
    );
    return res.json({ events: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function listRooms(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM laboratory_rooms WHERE is_active = true
        AND ($1::boolean=false OR department_id=$2::bigint) ORDER BY name`,
      [req.user.role === "staff", req.user.department_id]
    );
    return res.json({ rooms: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function saveEvent(req, res, next) {
  const event = normalizeEvent(req.body ?? {});
  const eventId = req.params.id ?? null;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let previousEvent = null;
    if (eventId) {
      const existing = await client.query(`SELECT * FROM calendar_events WHERE id = $1 FOR UPDATE`, [eventId]);
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "EVENT_NOT_FOUND", message: "Calendar event was not found." });
      }
      previousEvent = existing.rows[0];
      if (req.user.role === "staff") {
        const permitted = await client.query(`SELECT 1 FROM public.calendar_events event
          LEFT JOIN public.laboratory_rooms room ON room.id=event.room_id
          LEFT JOIN public.borrow_requests request ON request.id=event.borrow_request_id
          WHERE event.id=$1 AND ((event.room_id IS NULL AND event.borrow_request_id IS NULL)
            OR room.department_id=$2 OR request.department_id=$2)`, [eventId, req.user.department_id]);
        if (!permitted.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "EVENT_NOT_FOUND", message: "Calendar event was not found in your department." }); }
      }
    }

    if (req.user.role === "staff" && event.roomId) {
      const room = await client.query(`SELECT 1 FROM public.laboratory_rooms WHERE id=$1 AND department_id=$2 AND is_active=true`, [event.roomId, req.user.department_id]);
      if (!room.rowCount) { await client.query("ROLLBACK"); return res.status(422).json({ error: "INVALID_ROOM", reasons: ["Select an active laboratory room in your department."] }); }
    }

    if (isValidDate(event.date)) {
      let departmentId = req.user.department_id || null;
      if (event.roomId) {
        const assignedRoom = await client.query("SELECT department_id FROM public.laboratory_rooms WHERE id=$1", [event.roomId]);
        departmentId = assignedRoom.rows[0]?.department_id || departmentId;
      }
      const closure = await findClosure(client, {
        borrowDate: event.date, returnDate: event.date,
        startTime: event.start || null, endTime: event.end || null,
      }, departmentId);
      if (closure) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "CALENDAR_DATE_CLOSED", reasons: [`${event.date} is closed for ${closure.title}. Choose another date.`] });
      }
    }

    const errors = await validateRoomSchedule(client, event, eventId);
    if (errors.length) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "INVALID_CALENDAR_EVENT", reasons: errors });
    }

    const parameters = [
      event.title,
      event.date,
      event.start || null,
      event.end || null,
      event.type,
      event.description || null,
      event.roomId || null,
    ];
    const result = eventId
      ? await client.query(
        `UPDATE calendar_events
            SET title=$1, event_date=$2::date, start_time=$3::time,
                end_time=$4::time, event_type=$5, description=$6,
                room_id=$7, updated_at=now()
          WHERE id=$8 RETURNING *`,
        [...parameters, eventId]
      )
      : await client.query(
        `INSERT INTO calendar_events
          (title, event_date, start_time, end_time, event_type, description, room_id)
         VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7)
         RETURNING *`,
        parameters
      );

    await writeAuditLog(client, req.user, {
      action: eventId ? "calendar_event_updated" : "calendar_event_created",
      entityType: "calendar_event",
      entityId: result.rows[0].id,
      oldValues: previousEvent,
      newValues: result.rows[0],
    });

    await client.query("COMMIT");
    return res.status(eventId ? 200 : 201).json({ event: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function deleteEvent(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM calendar_events event
        WHERE event.id=$1 AND event.borrow_request_id IS NULL
          AND ($2::boolean=false OR event.room_id IS NULL OR EXISTS (
            SELECT 1 FROM laboratory_rooms room WHERE room.id=event.room_id AND room.department_id=$3::bigint
          ))
      RETURNING *`,
      [req.params.id, req.user.role === "staff", req.user.department_id]
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "EVENT_NOT_DELETABLE",
        message: "Linked borrowing events are managed through the borrowing request.",
      });
    }
    await writeAuditLog(client, req.user, {
      action: "calendar_event_deleted", entityType: "calendar_event",
      entityId: req.params.id, oldValues: result.rows[0],
    });
    await client.query("COMMIT");
    return res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  basicEventErrors,
  deleteEvent,
  listEvents,
  listRooms,
  normalizeEvent,
  saveEvent,
  validateRoomSchedule,
};
