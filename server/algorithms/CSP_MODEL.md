# Laboratory Scheduling CSP Model

## Scope

The model schedules laboratory-use requests within a planning horizon. It defines the search space and hard feasibility rules. The search/backtracking strategy is intentionally outside this ticket.

## Variables

For every request `i`, the solver receives one compound variable:

`X_i = (D_i, R_i, S_i, E_i)`

- `D_i`: assigned date (`YYYY-MM-DD`)
- `R_i`: assigned laboratory room ID
- `S_i`: integer start-slot index from midnight
- `E_i = S_i + durationSlots_i`: exclusive end-slot index

The implementation identifies it as `assignment:<requestId>`. A compound variable prevents a solver from constructing invalid intermediate combinations such as a start time without a room. `startTime` and `endTime` are included as derived display values.

## Domains

The domain of `X_i` is the Cartesian product of:

1. Dates inside the planning horizon and, when supplied, `request.allowedDates`.
2. Rooms satisfying the request's `allowedRoomIds`, `roomType`, minimum `attendees` capacity, and `requiredRoomFeatures`.
3. Start slots inside the request's `timeWindows`, or the global operating window when none is supplied.
4. End slots derived from `startSlot + durationSlots`, restricted to the selected time window.

With `policy.allowPartial` or `request.optional`, `UNASSIGNED` is also a domain value. Otherwise, an empty domain makes the model immediately unsatisfiable and the request ID appears in `metadata.emptyDomains`.

## Hard constraints

| Constraint | Scope | Rule |
| --- | --- | --- |
| Domain membership | Unary | Every assigned value must be one of the generated domain values. |
| Room non-overlap | Global | Two requests cannot overlap in the same room on the same date. `bufferSlots` adds room turnover time. |
| Requester non-overlap | Global | Requests belonging to the same `requesterId` cannot overlap. |
| Existing booking non-overlap | Unary | A proposed assignment cannot overlap a persisted booking for that room/date. |
| Room closure | Unary | A proposed assignment cannot overlap maintenance or another blocked interval. |
| Shared-resource capacity | Global | At every concurrent interval, summed `requiredSharedResources` cannot exceed `sharedResources` capacity. |

Room eligibility, capacity, features, allowed dates, time windows, duration, and operating hours are enforced during domain construction. This is equivalent to unary constraints while reducing the solver's search space.

Intervals are half-open: `[startSlot, endSlot)`. Therefore, a booking ending at 10:00 does not conflict with one starting at 10:00 unless `bufferSlots` is greater than zero.

## Required input contract

```js
{
  planningHorizon: { startDate: "2026-08-10", endDate: "2026-08-14" },
  policy: {
    slotMinutes: 30,
    operatingHours: { start: "07:00", end: "20:00" },
    bufferSlots: 0,
    allowPartial: false
  },
  rooms: [{
    id: "kitchen-lab-1",
    type: "kitchen",
    capacity: 30,
    features: { oven: true, projector: true }
  }],
  requests: [{
    id: "request-1",
    requesterId: "student-1",
    durationSlots: 4,
    attendees: 20,
    roomType: "kitchen",
    allowedDates: ["2026-08-10"],
    timeWindows: [{ start: "08:00", end: "12:00" }],
    requiredRoomFeatures: { oven: true },
    requiredSharedResources: { mixer: 2 }
  }],
  existingBookings: [{
    roomId: "kitchen-lab-1",
    date: "2026-08-10",
    start: "08:00",
    end: "09:00"
  }],
  roomClosures: [],
  sharedResources: { mixer: 10 }
}
```

All times must align with `slotMinutes`. Dates and times are treated as local scheduling values rather than converted through UTC.

## Solver interface

```js
const { createCspModel, isConsistent, isSolution } = require("./csp");
const model = createCspModel(input);

// A solver chooses one value per variable.
const assignment = {
  "assignment:request-1": model.domains["assignment:request-1"][0]
};

if (isConsistent(model, assignment)) {
  // Continue search or accept a complete solution.
}

// Use this before persisting: it requires every variable to be assigned.
if (isSolution(model, assignment)) {
  // Persist the validated complete schedule.
}
```

Constraint predicates accept partial assignments, which makes the model directly usable by backtracking, forward-checking, MRV, and arc-consistency implementations.

The builder rejects malformed dates/times, unknown room IDs, invalid capacities or quantities, and requests for shared resources not declared in `sharedResources`. Domain arrays and values are frozen to prevent a solver from accidentally mutating the model.
