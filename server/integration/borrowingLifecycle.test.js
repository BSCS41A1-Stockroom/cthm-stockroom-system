"use strict";

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const applicationPool = require("../config/db");
const { cancelBorrowRequest } = require("../controllers/borrowController");

const connectionString = process.env.TEST_DATABASE_URL;
const studentId = "00000000-0000-4000-8000-000000000041";
const professorId = "00000000-0000-4000-8000-000000000042";
const staffId = "00000000-0000-4000-8000-000000000043";
const adminId = "00000000-0000-4000-8000-000000000044";

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function invokeCancel(request) {
  const res = response();
  let failure;
  await cancelBorrowRequest(request, res, (error) => { failure = error; });
  if (failure) throw failure;
  return res;
}

async function setup(pool, schema) {
  await pool.query(`CREATE TABLE "${schema}".users (id uuid primary key)`);
  await pool.query(`CREATE TABLE "${schema}".borrow_requests (
    id bigint generated always as identity primary key,
    user_id uuid not null,student_name text not null,status text not null,
    department_id bigint not null,assigned_professor_user_id uuid,
    updated_at timestamptz default now(),
    constraint borrow_requests_status_check check (status in ('Pending','Validated','Approved','Borrowed','Returned','Rejected','Expired'))
  )`);
  const migration = await fs.readFile(path.join(__dirname,"../migrations/040_borrowing_request_cancellation.sql"),"utf8");
  await pool.query(migration.replaceAll("public.",`"${schema}".`).replaceAll("auth.users",`"${schema}".users`));
  await pool.query(`CREATE TABLE "${schema}".inventory (id bigint primary key,reserved_quantity integer not null check (reserved_quantity>=0),updated_at timestamptz default now())`);
  await pool.query(`CREATE TABLE "${schema}".borrow_request_items (request_id bigint,inventory_id bigint,quantity integer not null)`);
  await pool.query(`CREATE TABLE "${schema}".borrow_request_authorizations (request_id bigint, status text, rejected_at timestamptz,rejection_reason text,updated_at timestamptz default now())`);
  await pool.query(`CREATE TABLE "${schema}".calendar_events (borrow_request_id bigint)`);
  await pool.query(`CREATE TABLE "${schema}".profiles (user_id uuid,role text,department_id bigint,is_active boolean)`);
  await pool.query(`CREATE TABLE "${schema}".notifications (recipient_user_id uuid,type text,title text,message text,related_path text,entity_type text,entity_id text)`);
  await pool.query(`CREATE TABLE "${schema}".audit_logs (actor_user_id uuid,actor_email text,actor_name text,actor_role text,action text,entity_type text,entity_id text,old_values jsonb,new_values jsonb,metadata jsonb)`);
  await pool.query(`INSERT INTO "${schema}".users VALUES ($1),($2),($3),($4)`,[studentId,professorId,staffId,adminId]);
  await pool.query(`INSERT INTO "${schema}".profiles VALUES ($1,'student',2,true),($2,'professor',2,true),($3,'staff',2,true),($4,'admin',null,true)`,[studentId,professorId,staffId,adminId]);
}

async function seed(pool, schema, status, reserved = 2) {
  const result = await pool.query(`INSERT INTO "${schema}".borrow_requests
    (user_id,student_name,status,department_id,assigned_professor_user_id)
    VALUES ($1,'Test Student',$2,2,$3) RETURNING id`,[studentId,status,professorId]);
  const id = result.rows[0].id;
  const inventoryId = Number(id);
  await pool.query(`INSERT INTO "${schema}".inventory (id,reserved_quantity) VALUES ($1,$2)`,[inventoryId,reserved]);
  await pool.query(`INSERT INTO "${schema}".borrow_request_items VALUES ($1,$2,2)`,[id,inventoryId]);
  await pool.query(`INSERT INTO "${schema}".borrow_request_authorizations (request_id,status) VALUES ($1,$2)`,[id,status === "Pending" ? "awaiting" : "authorized"]);
  await pool.query(`INSERT INTO "${schema}".calendar_events VALUES ($1)`,[id]);
  return { id, inventoryId };
}

test("migration and real cancellation SQL preserve inventory, audit, notifications, and terminal state under concurrency", {
  skip: connectionString ? false : "Set TEST_DATABASE_URL to a disposable PostgreSQL project.",
}, async () => {
  if (process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
  }
  const pool = new Pool({ connectionString,max: 4 });
  const schema = `lifecycle_test_${crypto.randomBytes(8).toString("hex")}`;
  assert.match(schema,/^lifecycle_test_[0-9a-f]{16}$/);
  const originalConnect = applicationPool.connect;
  let created = false;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`); created = true;
    await setup(pool,schema);
    applicationPool.connect = async () => {
      const client = await pool.connect();
      return {
        query(sql,params) { return client.query(sql.replaceAll("public.",`"${schema}".`),params); },
        release() { client.release(); },
      };
    };
    const pending = await seed(pool,schema,"Pending");
    const first = await invokeCancel({ params:{ id:String(pending.id) },body:{},user:{ id:studentId,role:"student" } });
    assert.equal(first.statusCode,200);
    assert.equal(first.body.request.status,"Withdrawn");
    const withdrawn = await pool.query(`SELECT status,cancellation_reason,cancelled_by,cancelled_at FROM "${schema}".borrow_requests WHERE id=$1`,[pending.id]);
    assert.equal(withdrawn.rows[0].status,"Withdrawn");
    assert.equal(withdrawn.rows[0].cancelled_by,studentId);
    assert.ok(withdrawn.rows[0].cancelled_at);
    const stock = await pool.query(`SELECT reserved_quantity FROM "${schema}".inventory WHERE id=$1`,[pending.inventoryId]);
    assert.equal(stock.rows[0].reserved_quantity,0);
    const authorization = await pool.query(`SELECT status FROM "${schema}".borrow_request_authorizations WHERE request_id=$1`,[pending.id]);
    assert.equal(authorization.rows[0].status,"rejected");
    const calendar = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".calendar_events WHERE borrow_request_id=$1`,[pending.id]);
    assert.equal(calendar.rows[0].count,0);
    const audit = await pool.query(`SELECT action,old_values,new_values FROM "${schema}".audit_logs WHERE entity_id=$1`,[String(pending.id)]);
    assert.equal(audit.rows[0].action,"borrowing_withdrawn");
    assert.equal(audit.rows[0].old_values.status,"Pending");
    assert.equal(audit.rows[0].new_values.status,"Withdrawn");
    const professorNotice = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".notifications WHERE recipient_user_id=$1 AND entity_id=$2`,[professorId,String(pending.id)]);
    assert.equal(professorNotice.rows[0].count,1);
    const repeat = await invokeCancel({ params:{id:String(pending.id)},body:{},user:{id:studentId,role:"student"} });
    assert.equal(repeat.statusCode,409);

    const validated = await seed(pool,schema,"Validated");
    const [staffResult,studentResult] = await Promise.all([
      invokeCancel({ params:{id:String(validated.id)},body:{reason:"Class was cancelled"},user:{id:staffId,role:"staff",department_id:2} }),
      invokeCancel({ params:{id:String(validated.id)},body:{},user:{id:studentId,role:"student"} }),
    ]);
    assert.deepEqual([staffResult.statusCode,studentResult.statusCode].sort(),[200,409]);
    const validatedStock = await pool.query(`SELECT reserved_quantity FROM "${schema}".inventory WHERE id=$1`,[validated.inventoryId]);
    assert.equal(validatedStock.rows[0].reserved_quantity,0);
    const history = await pool.query(`SELECT status,cancellation_type FROM "${schema}".borrow_requests WHERE id=$1`,[validated.id]);
    assert.ok(["Withdrawn","Cancelled"].includes(history.rows[0].status));
    const count = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".audit_logs WHERE entity_id=$1`,[String(validated.id)]);
    assert.equal(count.rows[0].count,1);

    const staffOnly = await seed(pool,schema,"Validated");
    const wrongDepartment = await invokeCancel({params:{id:String(staffOnly.id)},body:{reason:"Wrong department"},user:{id:staffId,role:"staff",department_id:9}});
    assert.equal(wrongDepartment.statusCode,404);
    const staffCancellation = await invokeCancel({params:{id:String(staffOnly.id)},body:{reason:"Class was cancelled"},user:{id:staffId,role:"staff",department_id:2}});
    assert.equal(staffCancellation.statusCode,200);
    assert.equal(staffCancellation.body.request.status,"Cancelled");
    const studentNotice = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".notifications WHERE recipient_user_id=$1 AND entity_id=$2`,[studentId,String(staffOnly.id)]);
    assert.equal(studentNotice.rows[0].count,1);

    const approved = await seed(pool,schema,"Approved");
    const denied = await invokeCancel({params:{id:String(approved.id)},body:{reason:"Wrong schedule"},user:{id:adminId,role:"admin"}});
    assert.equal(denied.statusCode,409);
    const unchanged = await pool.query(`SELECT reserved_quantity FROM "${schema}".inventory WHERE id=$1`,[approved.inventoryId]);
    assert.equal(unchanged.rows[0].reserved_quantity,2);

    const inconsistent = await seed(pool,schema,"Pending",0);
    const failed = response(); let failure;
    await cancelBorrowRequest({params:{id:String(inconsistent.id)},body:{},user:{id:studentId,role:"student"}},failed,(error)=>{failure=error;});
    assert.match(failure.message,/Inventory counters are inconsistent/);
    const rollback = await pool.query(`SELECT status FROM "${schema}".borrow_requests WHERE id=$1`,[inconsistent.id]);
    assert.equal(rollback.rows[0].status,"Pending");
  } finally {
    applicationPool.connect = originalConnect;
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
