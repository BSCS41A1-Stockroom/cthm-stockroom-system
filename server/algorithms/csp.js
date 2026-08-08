"use strict";

/**
 * CSP model for assigning CTHM laboratory requests to a room and time slot.
 *
 * A solver assigns one value from domains[variable.id] to every variable.
 * Each value is an immutable tuple:
 *   { requestId, roomId, date, startSlot, endSlot, startTime, endTime }
 *
 * Constraint predicates accept a partial assignment object keyed by variable id.
 * They return true while a partial assignment is still viable and false only
 * when an assigned value violates the constraint.
 */

const VARIABLE_PREFIX = "assignment:";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_POLICY = Object.freeze({
  slotMinutes: 30,
  operatingHours: Object.freeze({ start: "07:00", end: "20:00" }),
  bufferSlots: 0,
  allowPartial: false,
});

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function variableId(requestId) {
  return `${VARIABLE_PREFIX}${requestId}`;
}

function isValidDate(date) {
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function parseTime(time, fieldName, slotMinutes) {
  invariant(typeof time === "string" && TIME_PATTERN.test(time), `${fieldName} must use HH:mm (24-hour) format`);
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute;
  invariant(totalMinutes % slotMinutes === 0, `${fieldName} must align to a ${slotMinutes}-minute slot`);
  return totalMinutes / slotMinutes;
}

function formatSlot(slot, slotMinutes) {
  const totalMinutes = slot * slotMinutes;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeWindows(windows, fallback, slotMinutes, fieldName) {
  const source = windows?.length ? windows : [fallback];
  return source.map((window, index) => {
    const startSlot = parseTime(window.start, `${fieldName}[${index}].start`, slotMinutes);
    const endSlot = parseTime(window.end, `${fieldName}[${index}].end`, slotMinutes);
    invariant(startSlot < endSlot, `${fieldName}[${index}] must end after it starts`);
    return { startSlot, endSlot };
  });
}

function intervalsOverlap(left, right, bufferSlots = 0) {
  return left.startSlot < right.endSlot + bufferSlots && right.startSlot < left.endSlot + bufferSlots;
}

function dateListBetween(startDate, endDate) {
  invariant(isValidDate(startDate), "planningHorizon.startDate must be a valid YYYY-MM-DD date");
  invariant(isValidDate(endDate), "planningHorizon.endDate must be a valid YYYY-MM-DD date");

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  invariant(!Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && start <= end,
    "planningHorizon must contain valid dates with startDate <= endDate");

  const dates = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.valueOf() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function assignedValues(assignment, scope) {
  return scope.map((id) => assignment[id]).filter((value) => value != null && value !== "UNASSIGNED");
}

function validateUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    invariant(item && typeof item.id === "string" && item.id.trim(), `${label} entries require a non-empty string id`);
    invariant(!ids.has(item.id), `${label} contains duplicate id '${item.id}'`);
    ids.add(item.id);
  }
}

function validateInput(input) {
  invariant(input && typeof input === "object", "CSP input is required");
  invariant(Array.isArray(input.requests) && input.requests.length > 0, "requests must be a non-empty array");
  invariant(Array.isArray(input.rooms) && input.rooms.length > 0, "rooms must be a non-empty array");
  invariant(input.planningHorizon, "planningHorizon is required");
  validateUniqueIds(input.requests, "requests");
  validateUniqueIds(input.rooms, "rooms");

  for (const room of input.rooms) {
    invariant(Number.isInteger(room.capacity) && room.capacity >= 0,
      `room '${room.id}' requires a non-negative integer capacity`);
  }
}

function roomSupportsRequest(room, request) {
  if (request.allowedRoomIds?.length && !request.allowedRoomIds.includes(room.id)) return false;
  if (request.roomType && room.type !== request.roomType) return false;
  if ((room.capacity ?? 0) < (request.attendees ?? 0)) return false;

  return Object.entries(request.requiredRoomFeatures ?? {}).every(
    ([feature, required]) => !required || Boolean(room.features?.[feature])
  );
}

function createDomain(request, rooms, dates, policy) {
  invariant(Number.isInteger(request.durationSlots) && request.durationSlots > 0,
    `request '${request.id}' requires a positive integer durationSlots`);

  const allowedDates = request.allowedDates?.length ? request.allowedDates : dates;
  const invalidDate = allowedDates.find((date) => !isValidDate(date));
  invariant(!invalidDate, `request '${request.id}' contains invalid allowedDate '${invalidDate}'`);

  const eligibleRooms = rooms.filter((room) => roomSupportsRequest(room, request));
  const defaultWindow = policy.operatingHours;
  const windows = normalizeWindows(request.timeWindows, defaultWindow, policy.slotMinutes,
    `request '${request.id}'.timeWindows`);
  const values = [];

  for (const date of allowedDates) {
    if (!dates.includes(date)) continue;
    for (const room of eligibleRooms) {
      for (const window of windows) {
        for (let startSlot = window.startSlot; startSlot + request.durationSlots <= window.endSlot; startSlot += 1) {
          const endSlot = startSlot + request.durationSlots;
          values.push(Object.freeze({
            requestId: request.id,
            roomId: room.id,
            date,
            startSlot,
            endSlot,
            startTime: formatSlot(startSlot, policy.slotMinutes),
            endTime: formatSlot(endSlot, policy.slotMinutes),
          }));
        }
      }
    }
  }

  if (policy.allowPartial || request.optional) values.push("UNASSIGNED");
  return values;
}

function createCspModel(input) {
  validateInput(input);

  const policy = {
    ...DEFAULT_POLICY,
    ...(input.policy ?? {}),
    operatingHours: {
      ...DEFAULT_POLICY.operatingHours,
      ...(input.policy?.operatingHours ?? {}),
    },
  };
  invariant(Number.isInteger(policy.slotMinutes) && policy.slotMinutes > 0 && 1440 % policy.slotMinutes === 0,
    "policy.slotMinutes must be a positive integer divisor of 1440");
  invariant(Number.isInteger(policy.bufferSlots) && policy.bufferSlots >= 0,
    "policy.bufferSlots must be a non-negative integer");
  invariant(typeof policy.allowPartial === "boolean", "policy.allowPartial must be a boolean");

  // Validate the global window even when every request supplies its own window.
  normalizeWindows(null, policy.operatingHours, policy.slotMinutes, "policy.operatingHours");

  const dates = dateListBetween(input.planningHorizon.startDate, input.planningHorizon.endDate);
  const roomIds = new Set(input.rooms.map((room) => room.id));
  const requestById = new Map(input.requests.map((request) => [request.id, request]));

  const sharedResources = input.sharedResources ?? {};
  for (const [resourceId, capacity] of Object.entries(sharedResources)) {
    invariant(Number.isInteger(capacity) && capacity >= 0,
      `sharedResources.${resourceId} must be a non-negative integer`);
  }
  for (const request of input.requests) {
    invariant(request.attendees == null || (Number.isInteger(request.attendees) && request.attendees >= 0),
      `request '${request.id}'.attendees must be a non-negative integer`);
    invariant(request.optional == null || typeof request.optional === "boolean",
      `request '${request.id}'.optional must be a boolean`);
    for (const roomId of request.allowedRoomIds ?? []) {
      invariant(roomIds.has(roomId), `request '${request.id}' references unknown room '${roomId}'`);
    }
    for (const [resourceId, quantity] of Object.entries(request.requiredSharedResources ?? {})) {
      invariant(Object.hasOwn(sharedResources, resourceId),
        `request '${request.id}' requires undeclared shared resource '${resourceId}'`);
      invariant(Number.isInteger(quantity) && quantity >= 0,
        `request '${request.id}'.requiredSharedResources.${resourceId} must be a non-negative integer`);
    }
  }

  const variables = input.requests.map((request) => Object.freeze({
    id: variableId(request.id),
    requestId: request.id,
    logicalVariables: Object.freeze(["date", "roomId", "startSlot", "endSlot"]),
  }));
  const scope = variables.map((variable) => variable.id);
  const domains = Object.fromEntries(input.requests.map((request) => [
    variableId(request.id),
    Object.freeze(createDomain(request, input.rooms, dates, policy)),
  ]));

  const normalizedExisting = (input.existingBookings ?? []).map((booking, index) => {
    invariant(typeof booking.roomId === "string" && roomIds.has(booking.roomId),
      `existingBookings[${index}].roomId must reference a known room`);
    invariant(isValidDate(booking.date), `existingBookings[${index}].date must be a valid YYYY-MM-DD date`);
    const startSlot = parseTime(booking.start, `existingBookings[${index}].start`, policy.slotMinutes);
    const endSlot = parseTime(booking.end, `existingBookings[${index}].end`, policy.slotMinutes);
    invariant(startSlot < endSlot, `existingBookings[${index}] must end after it starts`);
    return { ...booking, startSlot, endSlot };
  });

  const normalizedClosures = (input.roomClosures ?? []).map((closure, index) => {
    invariant(typeof closure.roomId === "string" && roomIds.has(closure.roomId),
      `roomClosures[${index}].roomId must reference a known room`);
    invariant(isValidDate(closure.date), `roomClosures[${index}].date must be a valid YYYY-MM-DD date`);
    const startSlot = parseTime(closure.start, `roomClosures[${index}].start`, policy.slotMinutes);
    const endSlot = parseTime(closure.end, `roomClosures[${index}].end`, policy.slotMinutes);
    invariant(startSlot < endSlot, `roomClosures[${index}] must end after it starts`);
    return { ...closure, startSlot, endSlot };
  });

  const constraints = [
    {
      id: "domain_membership",
      type: "unary",
      scope,
      description: "Every assigned value belongs to its generated domain.",
      isSatisfied(assignment) {
        return scope.every((id) => assignment[id] == null || domains[id].includes(assignment[id]));
      },
    },
    {
      id: "room_non_overlap",
      type: "global",
      scope,
      description: "A room cannot host overlapping requests; the configured turnover buffer is enforced.",
      isSatisfied(assignment) {
        const values = assignedValues(assignment, scope);
        return values.every((left, index) => values.slice(index + 1).every((right) =>
          left.date !== right.date || left.roomId !== right.roomId || !intervalsOverlap(left, right, policy.bufferSlots)
        ));
      },
    },
    {
      id: "requester_non_overlap",
      type: "global",
      scope,
      description: "Requests owned by the same requester cannot overlap.",
      isSatisfied(assignment) {
        const values = assignedValues(assignment, scope);
        return values.every((left, index) => values.slice(index + 1).every((right) => {
          const leftOwner = requestById.get(left.requestId).requesterId;
          const rightOwner = requestById.get(right.requestId).requesterId;
          return !leftOwner || !rightOwner || leftOwner !== rightOwner || left.date !== right.date || !intervalsOverlap(left, right);
        }));
      },
    },
    {
      id: "existing_booking_non_overlap",
      type: "unary",
      scope,
      description: "Assignments cannot collide with persisted room bookings.",
      isSatisfied(assignment) {
        return assignedValues(assignment, scope).every((value) => normalizedExisting.every((booking) =>
          value.date !== booking.date || value.roomId !== booking.roomId || !intervalsOverlap(value, booking, policy.bufferSlots)
        ));
      },
    },
    {
      id: "room_closure",
      type: "unary",
      scope,
      description: "Assignments cannot use a room during maintenance or blocked periods.",
      isSatisfied(assignment) {
        return assignedValues(assignment, scope).every((value) => normalizedClosures.every((closure) =>
          value.date !== closure.date || value.roomId !== closure.roomId || !intervalsOverlap(value, closure)
        ));
      },
    },
    {
      id: "shared_resource_capacity",
      type: "global",
      scope,
      description: "Concurrent requests cannot consume more shared equipment than inventory capacity.",
      isSatisfied(assignment) {
        const capacities = sharedResources;
        const values = assignedValues(assignment, scope);
        for (const [resourceId, capacity] of Object.entries(capacities)) {
          for (const date of dates) {
            const boundaries = values.filter((value) => value.date === date)
              .flatMap((value) => [value.startSlot, value.endSlot]);
            for (const slot of boundaries) {
              const used = values.reduce((total, value) => {
                if (value.date !== date || !(value.startSlot <= slot && slot < value.endSlot)) return total;
                return total + (requestById.get(value.requestId).requiredSharedResources?.[resourceId] ?? 0);
              }, 0);
              if (used > capacity) return false;
            }
          }
        }
        return true;
      },
    },
  ];

  const emptyDomains = variables.filter((variable) => domains[variable.id].length === 0).map((variable) => variable.requestId);

  return Object.freeze({
    variables: Object.freeze(variables),
    domains: Object.freeze(domains),
    constraints: Object.freeze(constraints),
    metadata: Object.freeze({
      dates: Object.freeze(dates),
      policy: Object.freeze(policy),
      emptyDomains: Object.freeze(emptyDomains),
      isImmediatelyUnsatisfiable: emptyDomains.length > 0,
    }),
  });
}

function isConsistent(model, assignment) {
  invariant(model?.variables && model?.constraints, "A valid CSP model is required");
  invariant(assignment && typeof assignment === "object", "assignment must be an object");
  return model.constraints.every((constraint) => constraint.isSatisfied(assignment));
}

function isComplete(model, assignment) {
  invariant(model?.variables, "A valid CSP model is required");
  invariant(assignment && typeof assignment === "object", "assignment must be an object");
  return model.variables.every((variable) => Object.hasOwn(assignment, variable.id));
}

function isSolution(model, assignment) {
  return isComplete(model, assignment) && isConsistent(model, assignment);
}

module.exports = {
  DEFAULT_POLICY,
  createCspModel,
  formatSlot,
  intervalsOverlap,
  isComplete,
  isConsistent,
  isSolution,
  parseTime,
  variableId,
};
