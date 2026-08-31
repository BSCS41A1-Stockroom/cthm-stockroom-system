"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const connectionString = process.env.TEST_DATABASE_URL;

async function reserve(pool, schema, quantity, afterLock) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inventory = await client.query(
      `SELECT id, quantity, reserved_quantity
         FROM ${schema}.inventory
        WHERE id = 1
        ORDER BY id
        FOR UPDATE`
    );

    if (afterLock) await afterLock();

    const item = inventory.rows[0];
    const available = item.quantity - item.reserved_quantity;
    if (quantity > available) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `UPDATE ${schema}.inventory
          SET reserved_quantity = reserved_quantity + $1
        WHERE id = 1`,
      [quantity]
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function submitForStudent(pool, schema, studentId, afterLock) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const key = studentId.trim().toLowerCase();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    if (afterLock) await afterLock();

    const existing = await client.query(
      `SELECT id FROM ${schema}.borrow_requests
        WHERE lower(trim(student_id)) = $1
          AND status = ANY($2::text[])
          AND borrow_date <= $3::date
          AND return_date >= $4::date`,
      [key, ["Pending", "Validated", "Approved", "Borrowed"], "2026-09-12", "2026-09-10"]
    );
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `INSERT INTO ${schema}.borrow_requests
        (student_id, status, borrow_date, return_date) VALUES ($1, 'Pending', $2, $3)`,
      [studentId, "2026-09-10", "2026-09-12"]
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test("concurrent PostgreSQL reservations cannot over-allocate inventory", {
  skip: connectionString ? false : "Set TEST_DATABASE_URL to run PostgreSQL integration tests.",
}, async () => {
  const pool = new Pool({ connectionString, max: 3 });
  const schema = `borrow_test_${crypto.randomBytes(8).toString("hex")}`;
  let releaseFirstLock;
  let firstHasLock;
  const firstLocked = new Promise((resolve) => { firstHasLock = resolve; });
  const holdFirst = new Promise((resolve) => { releaseFirstLock = resolve; });

  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(
      `CREATE TABLE ${schema}.inventory (
         id integer PRIMARY KEY,
         quantity integer NOT NULL CHECK (quantity >= 0),
         reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0)
       )`
    );
    await pool.query(`INSERT INTO ${schema}.inventory (id, quantity) VALUES (1, 5)`);

    const first = reserve(pool, schema, 4, async () => {
      firstHasLock();
      await holdFirst;
    });
    await firstLocked;

    const second = reserve(pool, schema, 4);
    releaseFirstLock();

    assert.deepEqual(await Promise.all([first, second]), [true, false]);
    const finalState = await pool.query(
      `SELECT quantity, reserved_quantity FROM ${schema}.inventory WHERE id = 1`
    );
    assert.deepEqual(finalState.rows[0], { quantity: 5, reserved_quantity: 4 });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});

test("concurrent requests by the same student cannot bypass active-request validation", {
  skip: connectionString ? false : "Set TEST_DATABASE_URL to run PostgreSQL integration tests.",
}, async () => {
  const pool = new Pool({ connectionString, max: 3 });
  const schema = `student_lock_test_${crypto.randomBytes(8).toString("hex")}`;
  let releaseFirstLock;
  let firstHasLock;
  const firstLocked = new Promise((resolve) => { firstHasLock = resolve; });
  const holdFirst = new Promise((resolve) => { releaseFirstLock = resolve; });

  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(
      `CREATE TABLE ${schema}.borrow_requests (
         id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         student_id text NOT NULL,
         status text NOT NULL,
         borrow_date date NOT NULL,
         return_date date NOT NULL
       )`
    );

    const first = submitForStudent(pool, schema, " Student-1 ", async () => {
      firstHasLock();
      await holdFirst;
    });
    await firstLocked;
    const second = submitForStudent(pool, schema, "student-1");
    releaseFirstLock();

    assert.deepEqual(await Promise.all([first, second]), [true, false]);
    const requests = await pool.query(`SELECT count(*)::integer AS count FROM ${schema}.borrow_requests`);
    assert.equal(requests.rows[0].count, 1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
