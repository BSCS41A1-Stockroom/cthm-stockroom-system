"use strict";

const pool = require("../config/db");
const { createCspModel, isSolution, parseTime } = require("../algorithms/csp");

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

function basicEventErrors(event) {
  const errors = [];
  if (!event.title) errors.push("Event title is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date ?? "")) errors.push("A valid event date is required.");
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

  const startSlot = parseTime(event.start.slice(0, 5), "start", 30);
  const endSlot = parseTime(event.end.slice(0, 5), "end", 30);
  const room = roomResult.rows[0];
  const model = createCspModel({
    planningHorizon: { startDate: event.date, endDate: event.date },
    policy: { slotMinutes: 30, operatingHours: { start: "07:00", end: "20:00" } },
    rooms: [{
      id: String(room.id),
      type: room.room_type,
      capacity: room.capacity,
      features: room.features,
    }],
    requests: [{
      id: "calendar-event",
      durationSlots: endSlot - startSlot,
      allowedRoomIds: [String(room.id)],
      allowedDates: [event.date],
      timeWindows: [{ start: event.start.slice(0, 5), end: event.end.slice(0, 5) }],
    }],
    existingBookings: existingResult.rows.map((booking) => ({
      roomId: String(booking.room_id),
      date: booking.event_date.toISOString?.().slice(0, 10) ?? String(booking.event_date),
      start: String(booking.start_time).slice(0, 5),
      end: String(booking.end_time).slice(0, 5),
    })),
    roomClosures: [],
    sharedResources: {},
  });

  const variable = model.variables[0];
  const value = model.domains[variable.id][0];
  if (!value || !isSolution(model, { [variable.id]: value })) {
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
        ORDER BY events.event_date, events.start_time NULLS FIRST, events.id`
    );
    return res.json({ events: result.rows });
  } catch (error) {
    return next(error);
  }
}

async function listRooms(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM laboratory_rooms WHERE is_active = true ORDER BY name`
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
    if (eventId) {
      const existing = await client.query(`SELECT id FROM calendar_events WHERE id = $1 FOR UPDATE`, [eventId]);
      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "EVENT_NOT_FOUND", message: "Calendar event was not found." });
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
  try {
    const result = await pool.query(
      `DELETE FROM calendar_events
        WHERE id=$1 AND borrow_request_id IS NULL
      RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "EVENT_NOT_DELETABLE",
        message: "Linked borrowing events are managed through the borrowing request.",
      });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
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
