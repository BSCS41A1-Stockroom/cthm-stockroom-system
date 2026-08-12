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
