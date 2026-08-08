"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCspModel, isComplete, isConsistent, isSolution, variableId } = require("./csp");

function baseInput() {
  return {
    planningHorizon: { startDate: "2026-08-10", endDate: "2026-08-10" },
    policy: { slotMinutes: 30, operatingHours: { start: "08:00", end: "12:00" } },
    rooms: [
      { id: "lab-a", type: "kitchen", capacity: 30, features: { oven: true } },
      { id: "lab-b", type: "kitchen", capacity: 10, features: { oven: false } },
    ],
    requests: [{
      id: "r1",
      requesterId: "student-1",
      durationSlots: 2,
      attendees: 20,
      roomType: "kitchen",
      requiredRoomFeatures: { oven: true },
    }],
    existingBookings: [],
    roomClosures: [],
    sharedResources: {},
  };
}

test("builds a filtered domain from date, room, duration, and operating hours", () => {
  const model = createCspModel(baseInput());
  const domain = model.domains[variableId("r1")];

  assert.equal(domain.length, 7);
  assert.ok(domain.every((value) => value.roomId === "lab-a"));
  assert.deepEqual(
    { start: domain[0].startTime, end: domain[0].endTime },
    { start: "08:00", end: "09:00" }
  );
  assert.equal(model.metadata.isImmediatelyUnsatisfiable, false);
});

test("rejects assignments that overlap in the same room", () => {
  const input = baseInput();
  input.requests.push({ ...input.requests[0], id: "r2", requesterId: "student-2" });
  const model = createCspModel(input);
  const left = model.domains[variableId("r1")][0];
  const right = model.domains[variableId("r2")][1];

  assert.equal(isConsistent(model, {
    [variableId("r1")]: left,
    [variableId("r2")]: right,
  }), false);
});

test("rejects existing-booking and closure collisions", () => {
  const input = baseInput();
  input.existingBookings.push({ roomId: "lab-a", date: "2026-08-10", start: "08:30", end: "09:30" });
  const model = createCspModel(input);

  assert.equal(isConsistent(model, { [variableId("r1")]: model.domains[variableId("r1")][0] }), false);
  assert.equal(isConsistent(model, { [variableId("r1")]: model.domains[variableId("r1")][3] }), true);
});

test("enforces shared equipment capacity for concurrent requests", () => {
  const input = baseInput();
  input.rooms[1] = { id: "lab-b", type: "kitchen", capacity: 30, features: { oven: true } };
  input.requests[0].requiredSharedResources = { mixer: 2 };
  input.requests.push({ ...input.requests[0], id: "r2", requesterId: "student-2", requiredSharedResources: { mixer: 2 } });
  input.sharedResources = { mixer: 3 };
  const model = createCspModel(input);
  const first = model.domains[variableId("r1")].find((value) => value.roomId === "lab-a");
  const second = model.domains[variableId("r2")].find((value) => value.roomId === "lab-b");

  assert.equal(isConsistent(model, {
    [variableId("r1")]: first,
    [variableId("r2")]: second,
  }), false);
});

test("reports a mandatory request with no domain as immediately unsatisfiable", () => {
  const input = baseInput();
  input.requests[0].attendees = 100;
  const model = createCspModel(input);

  assert.deepEqual(model.metadata.emptyDomains, ["r1"]);
  assert.equal(model.metadata.isImmediatelyUnsatisfiable, true);
});

test("enforces requester overlap even when rooms differ", () => {
  const input = baseInput();
  input.rooms[1] = { id: "lab-b", type: "kitchen", capacity: 30, features: { oven: true } };
  input.requests.push({ ...input.requests[0], id: "r2" });
  const model = createCspModel(input);
  const first = model.domains[variableId("r1")].find((value) => value.roomId === "lab-a");
  const second = model.domains[variableId("r2")].find((value) => value.roomId === "lab-b");

  assert.equal(isConsistent(model, {
    [variableId("r1")]: first,
    [variableId("r2")]: second,
  }), false);
});

test("enforces room closures and turnover buffers", () => {
  const input = baseInput();
  input.policy.bufferSlots = 1;
  input.roomClosures.push({ roomId: "lab-a", date: "2026-08-10", start: "10:00", end: "10:30" });
  const model = createCspModel(input);
  const touchesClosure = model.domains[variableId("r1")].find((value) => value.startTime === "09:30");
  assert.equal(isConsistent(model, { [variableId("r1")]: touchesClosure }), false);

  const inputWithoutClosure = baseInput();
  inputWithoutClosure.policy.bufferSlots = 1;
  inputWithoutClosure.requests.push({ ...inputWithoutClosure.requests[0], id: "r2", requesterId: "student-2" });
  const bufferedModel = createCspModel(inputWithoutClosure);
  const first = bufferedModel.domains[variableId("r1")].find((value) => value.startTime === "08:00");
  const adjacent = bufferedModel.domains[variableId("r2")].find((value) => value.startTime === "09:00");
  assert.equal(isConsistent(bufferedModel, {
    [variableId("r1")]: first,
    [variableId("r2")]: adjacent,
  }), false);
});

test("supports optional unassigned requests without hiding mandatory empty domains", () => {
  const input = baseInput();
  input.requests[0].attendees = 100;
  input.requests[0].optional = true;
  const model = createCspModel(input);

  assert.deepEqual(model.domains[variableId("r1")], ["UNASSIGNED"]);
  assert.equal(model.metadata.isImmediatelyUnsatisfiable, false);
  assert.equal(isSolution(model, { [variableId("r1")]: "UNASSIGNED" }), true);
});

test("rejects malformed dates, unknown rooms, and undeclared resources", () => {
  const badDate = baseInput();
  badDate.planningHorizon.startDate = "2026-02-30";
  assert.throws(() => createCspModel(badDate), /valid YYYY-MM-DD/);

  const unknownRoom = baseInput();
  unknownRoom.requests[0].allowedRoomIds = ["missing-room"];
  assert.throws(() => createCspModel(unknownRoom), /unknown room/);

  const unknownResource = baseInput();
  unknownResource.requests[0].requiredSharedResources = { mixer: 1 };
  assert.throws(() => createCspModel(unknownResource), /undeclared shared resource/);
});

test("distinguishes partial consistency from a complete solution", () => {
  const input = baseInput();
  input.requests.push({ ...input.requests[0], id: "r2", requesterId: "student-2" });
  const model = createCspModel(input);
  const partial = { [variableId("r1")]: model.domains[variableId("r1")][0] };

  assert.equal(isConsistent(model, partial), true);
  assert.equal(isComplete(model, partial), false);
  assert.equal(isSolution(model, partial), false);
});

test("produces and validates a complete schedule through backtracking", () => {
  const input = baseInput();
  input.requests.push(
    { ...input.requests[0], id: "r2", requesterId: "student-2" },
    { ...input.requests[0], id: "r3", requesterId: "student-3" }
  );
  const model = createCspModel(input);

  function solve(index, assignment) {
    if (index === model.variables.length) return isSolution(model, assignment) ? { ...assignment } : null;
    const id = model.variables[index].id;
    for (const value of model.domains[id]) {
      assignment[id] = value;
      if (isConsistent(model, assignment)) {
        const solution = solve(index + 1, assignment);
        if (solution) return solution;
      }
      delete assignment[id];
    }
    return null;
  }

  const solution = solve(0, {});
  assert.ok(solution, "expected the model to have a complete solution");
  assert.equal(isSolution(model, solution), true);
  assert.equal(Object.keys(solution).length, 3);
});
