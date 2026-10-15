import { seedDiscovery } from "./discovery-seed.mjs";
// Isolated Supabase protocol fixture. Never connects to a hosted project.
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001",
  viewer = "00000000-0000-0000-0000-000000000002";
const secret = crypto.randomBytes(32);
function user(id) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === owner ? "owner@example.test" : "viewer@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}
function token(id) {
  const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url"),
    head = enc({ alg: "HS256", typ: "JWT" }),
    body = enc({
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: "http://127.0.0.1:54339/auth/v1",
    }),
    payload = head + "." + body;
  return (
    payload +
    "." +
    crypto.createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
function session(id) {
  return {
    access_token: token(id),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "test-" + id,
    user: user(id),
  };
}
function identity(req) {
  try {
    const t = req.headers.authorization?.replace(/^Bearer /, "");
    const [h, b, s] = t.split(".");
    if (
      crypto
        .createHmac("sha256", secret)
        .update(h + "." + b)
        .digest("base64url") !== s
    )
      return null;
    const id = JSON.parse(Buffer.from(b, "base64url")).sub;
    return [owner, viewer].includes(id) ? id : null;
  } catch {
    return null;
  }
}
function ident(s) {
  if (!/^[a-z_][a-z_0-9]*$/i.test(s)) throw Error("Invalid identifier");
  return '"' + s + '"';
}
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info,prefer,range,range-unit,x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "content-range",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
let queue = Promise.resolve();
(async () => {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;alter default privileges in schema public grant all on tables to anon,authenticated;`,
  );
  for (const file of fs
    .readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      fs
        .readFileSync("supabase/migrations/" + file, "utf8")
        .replace('create extension if not exists "pgcrypto";', ""),
    );
  await db.exec(
    `insert into auth.users values('${owner}'),('${viewer}');insert into profiles(id,role) values('${owner}','owner'),('${viewer}','viewer');`,
  );
  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 200, {});
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://127.0.0.1:54339");
    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse(raw || "{}");
      const id = body.email === "owner@example.test" ? owner : viewer;
      return send(res, 200, session(id));
    }
    if (url.pathname === "/auth/v1/user") {
      const id = identity(req);
      return send(res, id ? 200 : 401, id ? user(id) : { message: "No user" });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    if (url.pathname === "/auth/v1/.well-known/jwks.json")
      return send(res, 200, { keys: [] });
    if (url.pathname === "/__reset") {
      queue = queue.then(async () => {
        await db.exec(
          "truncate project_events,tasks,work_packages,raid_items,projects,meetings cascade",
        );
        send(res, 200, { ok: true });
      });
      return;
    }
    if (url.pathname === "/__seed-pagination" && req.method === "POST") {
      queue = queue
        .then(async () => {
          await db.exec("begin; set local role authenticated");
          await db.query(
            "select set_config('request.jwt.claim.sub', $1, true)",
            [owner],
          );
          const project = (
            await db.query(
              "insert into projects (name) values ('Pagination project') returning id",
            )
          ).rows[0].id;
          const workPackage = (
            await db.query(
              "insert into work_packages (project_id, name) values ($1, 'Large package') returning id",
              [project],
            )
          ).rows[0].id;
          await db.query(
            "insert into tasks (work_package_id, title, sort_order) select $1, 'Bulk task ' || n, n from generate_series(1, 1101) n",
            [workPackage],
          );
          await db.exec("commit");
          send(res, 200, { projectId: project, workPackageId: workPackage });
        })
        .catch(async (error) => {
          await db.exec("rollback");
          send(res, 500, { message: error.message });
        });
      return;
    }
    if (url.pathname === "/__seed-discovery") {
      queue = queue.then(async () => {
        try {
          send(res, 200, await seedDiscovery(db));
        } catch (e) {
          send(res, 500, { error: e.message });
        }
      });
      return;
    }
    if (url.pathname === "/__inspect") {
      queue = queue.then(async () => {
        const counts = {};
        for (const table of [
          "projects",
          "work_packages",
          "tasks",
          "project_events",
          "raid_items",
        ])
          counts[table] = (
            await db.query("select count(*)::int as n from " + ident(table))
          ).rows[0].n;
        send(res, 200, counts);
      });
      return;
    }
    queue = queue
      .then(async () => {
        try {
          const id = identity(req);
          await db.exec("begin");
          await db.exec("set local role " + (id ? "authenticated" : "anon"));
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
            id || "",
          ]);
          if (url.pathname === "/rest/v1/rpc/current_user_role") {
            const r = await db.query(
              "select public.current_user_role() as role",
            );
            await db.exec("commit");
            return send(res, 200, r.rows[0].role);
          }
          const table = url.pathname.replace("/rest/v1/", "");
          if (url.pathname === "/rest/v1/rpc/send_to_project") {
            const body = JSON.parse(raw),
              r = await db.query(
                "select public.send_to_project($1,$2,$3::jsonb,$4) as result",
                [
                  body.p_meeting_id,
                  body.p_project_id,
                  JSON.stringify(body.p_items),
                  body.p_work_package_id || null,
                ],
              );
            await db.exec("commit");
            return send(res, 200, r.rows[0].result);
          }
          const allowed = (
            await db.query(
              "select tablename from pg_tables where schemaname = 'public'",
            )
          ).rows.map((r) => r.tablename);
          if (!allowed.includes(table)) throw Error("Unknown table");
          const params = [],
            conditions = [];
          for (const [k, v] of url.searchParams) {
            if (["select", "order", "limit", "offset"].includes(k)) continue;
            const field = ident(k);
            if (v.startsWith("eq.")) {
              params.push(v.slice(3));
              conditions.push(field + " = $" + params.length);
            } else if (v.startsWith("in.(")) {
              const values = v.slice(4, -1).split(",");
              const placeholders = values.map((x) => {
                params.push(x.replace(/^"|"$/g, ""));
                return "$" + params.length;
              });
              conditions.push(field + " in (" + placeholders.join(",") + ")");
            } else if (v === "is.null") conditions.push(field + " is null");
            else throw Error("Unsupported filter " + v);
          }
          const where = conditions.length
            ? " where " + conditions.join(" and ")
            : "";
          const columns = (url.searchParams.get("select") || "*")
            .split(",")
            .map((c) => (c === "*" ? "*" : ident(c)))
            .join(",");
          let sql,
            values = params;
          if (req.method === "GET") {
            sql = "select " + columns + " from " + ident(table) + where;
            const order = url.searchParams.get("order");
            if (order)
              sql +=
                " order by " +
                order
                  .split(",")
                  .map((o) => {
                    const [field, dir] = o.split(".");
                    return ident(field) + (dir === "desc" ? " desc" : " asc");
                  })
                  .join(",");
            const limit = url.searchParams.get("limit");
            if (limit) sql += " limit " + Number(limit);
            const offset = url.searchParams.get("offset");
            if (offset) sql += " offset " + Number(offset);
          } else if (req.method === "POST") {
            const body = JSON.parse(raw),
              keys = Object.keys(body);
            values = Object.values(body);
            sql =
              "insert into " +
              ident(table) +
              " (" +
              keys.map(ident).join(",") +
              ") values (" +
              keys.map((_, i) => "$" + (i + 1)).join(",") +
              ") returning " +
              columns;
          } else if (req.method === "PATCH") {
            const body = JSON.parse(raw),
              keys = Object.keys(body);
            const set = keys.map((k) => {
              values.push(body[k]);
              return ident(k) + " = $" + values.length;
            });
            sql =
              "update " +
              ident(table) +
              " set " +
              set.join(",") +
              where +
              " returning " +
              columns;
          } else if (req.method === "DELETE")
            sql =
              "delete from " + ident(table) + where + " returning " + columns;
          else throw Error("Unsupported method");
          const r = await db.query(sql, values);
          for (const row of r.rows)
            for (const field of ["due_date", "target_date"])
              if (row[field])
                row[field] = new Date(row[field]).toISOString().slice(0, 10);
          await db.exec("commit");
          const single = (req.headers.accept || "").includes(
            "vnd.pgrst.object",
          );
          if (single && r.rows.length !== 1)
            return send(res, 406, {
              code: "PGRST116",
              message: "Expected one row",
              details: "The result contains " + r.rows.length + " rows",
            });
          send(
            res,
            req.method === "POST" ? 201 : 200,
            single ? r.rows[0] : r.rows,
          );
        } catch (e) {
          await db.exec("rollback").catch(() => {});
          send(res, e.code === "42501" ? 403 : 400, {
            code: e.code || "TEST",
            message: e.message,
          });
        }
      })
      .catch((e) => {
        console.error(e.message);
        send(res, 500, { message: e.message });
      });
  });
  server.listen(54339, "127.0.0.1", () =>
    console.log(
      "Isolated Supabase protocol fixture ready on 54339 (PGlite, real RLS, no hosted data).",
    ),
  );
})();
