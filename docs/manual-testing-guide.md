# Dispatch Service — Manual Testing Guide

A hands-on walkthrough to exercise `dispatch-service` locally end-to-end: the event-driven assignment flow + the HTTP endpoints. Pair this with [`dispatch-service.http`](dispatch-service.http) (VS Code REST Client) or `curl`.

> **What makes dispatch different from order/auth/user:** there is **no HTTP endpoint that creates an assignment**. An assignment is born when dispatch **consumes an `order.created` event**, and a driver only gets *offered* the delivery if the FIFO pool has a free driver (fed by `driver.availability.changed` events). So the flow is: **publish two events → then call the HTTP endpoints.** Dispatch also needs **Redis** (the driver pool) on top of Postgres + RabbitMQ.
>
> The happy path (offer → accept/reject → expire) needs **only** dispatch + its infra. The **driver directory** (user-service) is needed **only** for `force-assign` validation and the `drivers/available` name/vehicle enrichment — Section 1 is optional and you can skip it until you test those.

---

## 0. Prerequisites

- Docker running.
- Node 20, repo installed (`npm install`) and building (`npm run build`).
- From the repo root: `/Users/angelito/personal/Logistics-Delivery-Management-System/logistics-dispatch-service`.

Bring up the dev infra:

```bash
# Postgres (:5437) + Redis (:6380) for dispatch (docker-compose.yml)
docker compose up -d

# RabbitMQ: the platform's shared broker `logistics-rabbitmq` (dev/dev creds)
# is probably already running — check `docker ps`. If so, use it and skip this.
# Otherwise start one (a bare image defaults to guest/guest):
#   docker run -d --name logistics-rabbitmq -e RABBITMQ_DEFAULT_USER=dev -e RABBITMQ_DEFAULT_PASS=dev \
#     -p 5672:5672 -p 15672:15672 rabbitmq:3.13-management
```

> **Broker credentials:** the platform's `logistics-rabbitmq` uses **`dev`/`dev`**, so `RABBITMQ_URL=amqp://dev:dev@localhost:5672` (the `.env.example` default). A bare `rabbitmq` image uses `guest`/`guest` — match `RABBITMQ_URL` to whichever broker you point at, or boot fails with `ACCESS_REFUSED`.

> ### ⚠️ Redis port — the dispatch-specific gotcha
> `.env.example` ships `REDIS_URL=redis://localhost:6379`, which targets the **platform** `logistics-redis` (preferred in a full local run). The dispatch `docker compose` Redis is mapped to **:6380** (to avoid clashing with 6379). So:
> - Using the **platform** `logistics-redis` (6379)? Keep `REDIS_URL=…:6379` — you don't even need the compose Redis.
> - Using **only** the dispatch compose stack? Set `REDIS_URL=redis://localhost:6380`.
>
> A wrong port → `readyz` 503 and offers never get made (the pool is unreachable).

Create your `.env` and apply migrations:

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
npm run prisma:migrate    # applies 20260605061904_init_dispatch to :5437
```

`.env` defaults that matter:

| Var | Default | Note |
|---|---|---|
| `PORT` | `3004` | the API port |
| `DISPATCH_DB_URL` | `…:5437/dispatch` | dev Postgres |
| `REDIS_URL` | `…:6379` | driver pool — platform redis (6379) or compose (6380); see box above |
| `RABBITMQ_URL` | `amqp://dev:dev@localhost:5672` | broker (`logistics-rabbitmq` = dev/dev) |
| `JWT_SECRET` | `change-me-…aaaa` | verifies inbound user JWTs (see alignment box) |
| `SERVICE_JWT_SECRET` | `change-me-…bbbb` | signs the outbound service JWT to user-service (must differ from `JWT_SECRET`) |
| `DISPATCH_USER_SERVICE_URL` | `http://localhost:3001` | driver-profile resolution (only force-assign + available enrichment) |
| `DISPATCH_OFFER_TTL_SECONDS` | `30` | offer accept-timeout — **set to `5` to watch expiry quickly** |
| `DISPATCH_MAX_OFFER_ATTEMPTS` | `3` | offers before `failed` |

> ### ⚠️ Cross-service alignment
> | If you use… | This must hold | Symptom if wrong |
> |---|---|---|
> | An **auth-service-minted** user token | `JWT_SECRET` **==** auth-service's `AUTH_JWT_SECRET` | `401 invalid token` |
> | **Real user-service** for force-assign | dispatch's `SERVICE_JWT_SECRET` **==** user-service's `USER_SERVICE_JWT_SECRET` | force-assign `422`/`500` |
> | Always | `JWT_SECRET` **≠** `SERVICE_JWT_SECRET` | boot refuses (the env-schema refine) |
>
> **Restart dispatch after any `.env` change** — env is read once at boot.

---

## 1. Driver directory (OPTIONAL — only for force-assign + `drivers/available` names)

Skip this for the offer/accept/reject/expiry flow. Do it before testing `force-assign` or to get real names in `GET /dispatch/drivers/available`.

### Path B — driver stub (fastest)

Save as `/tmp/driver-stub.js` — a dependency-free server answering the one endpoint dispatch calls:

```js
// /tmp/driver-stub.js  —  run: node /tmp/driver-stub.js
// Set DISPATCH_USER_SERVICE_URL=http://localhost:3001 (the default) to point dispatch here.
const http = require("node:http");
const DRIVERS = {
  // the driverId you force-assign / make available (match your JWT sub):
  "04940000-0000-7000-8000-000000000d01": { userId: "04940000-0000-7000-8000-000000000d01", displayName: "Ada Driver", vehicleType: "motorcycle", profileComplete: true },
  "04940000-0000-7000-8000-000000000d02": { userId: "04940000-0000-7000-8000-000000000d02", displayName: "Ben Driver", vehicleType: "car", profileComplete: true },
};
http.createServer((req, res) => {
  const m = req.url.match(/^\/v1\/users\/internal\/drivers\/([^/?]+)/);
  if (!m) { res.writeHead(404).end(); return; }
  if (!(req.headers["x-service-authorization"] || "").startsWith("Bearer ")) { res.writeHead(401).end(); return; }
  const d = DRIVERS[m[1]];
  if (!d) { res.writeHead(404).end(); return; }       // → dispatch maps to 422 (DriverNotAssignable)
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(d));
}).listen(3001, () => console.log("driver-stub on http://localhost:3001"));
```

```bash
node /tmp/driver-stub.js     # leave running; DISPATCH_USER_SERVICE_URL=http://localhost:3001 (default) points here
# NOTE: the stub and a real user-service both want :3001 — run only ONE.
```

The stub ignores the service-JWT signature (only checks the header is present), so you don't need to align `SERVICE_JWT_SECRET` for Path B.

### Path A — real user-service

Boot user-service, seed a `driver`, set `DISPATCH_USER_SERVICE_URL` to it, and align dispatch's `SERVICE_JWT_SECRET` with user-service's `USER_SERVICE_JWT_SECRET`.

---

## 2. Boot dispatch + verify it's healthy

```bash
npm run dev        # tsx --env-file=.env, listens on :3004
```

In another terminal:

```bash
curl -s localhost:3004/healthz                 # {"status":"ok"} (liveness)
curl -s -o /dev/null -w "%{http_code}\n" localhost:3004/readyz   # 200 when Postgres + RabbitMQ + Redis are up
```

If `readyz` is `503`: Postgres, RabbitMQ, or **Redis** isn't reachable — check `docker ps` and the `REDIS_URL` port (box in §0).

---

## 3. Mint user JWTs (dispatch verifies, never mints)

Dispatch verifies with `JWT_SECRET` and needs only `sub` + `role` (HS256). **The driver token's `sub` MUST equal the driverId you make available in §4.**

```bash
export $(grep -v '^#' .env | xargs)
# DRIVER token — sub = the driver you'll make available + offer to:
node -e 'const jwt=require("jsonwebtoken"); console.log(jwt.sign({sub:"04940000-0000-7000-8000-000000000d01", role:"driver"}, process.env.JWT_SECRET, {algorithm:"HS256", expiresIn:"30m"}))'
# ADMIN token:
node -e 'const jwt=require("jsonwebtoken"); console.log(jwt.sign({sub:"05940000-0000-7000-8000-00000000adm1", role:"admin"}, process.env.JWT_SECRET, {algorithm:"HS256", expiresIn:"30m"}))'
```

Paste into `@driverToken` / `@adminToken` in `dispatch-service.http` (or `export TOKEN=…` for curl).

---

## 4. Drive an assignment into existence (RabbitMQ UI)

Open the RabbitMQ management UI at **http://localhost:15672** (login **dev/dev**) → **Exchanges** → `logistics.events` → **Publish message**. Publish these two, in order (change `eventId` each time):

**STEP 1 — make a driver available** (adds the driver to the FIFO pool). Routing key `driver.availability.changed`:

```json
{
  "eventId": "07940000-0000-7000-8000-aaaaaaaaaaaa",
  "eventType": "driver.availability.changed",
  "eventVersion": "1.0.0",
  "occurredAt": "2026-06-09T00:00:00Z",
  "correlationId": "smoke-1",
  "producer": "user-service",
  "data": { "userId": "04940000-0000-7000-8000-000000000d01", "isAvailable": true, "changedAt": "2026-06-09T00:00:00Z" }
}
```

> ⚠️ The field is **`userId`** (the driver's user id), NOT `driverId`. (A `driverId`-named field is silently ignored and the pool stays empty — this exact mismatch was a real bug the integration tests caught.)

**STEP 2 — place an order** (creates the assignment + offers it to the driver). Routing key `order.created`:

```json
{
  "eventId": "07940000-0000-7000-8000-bbbbbbbbbbbb",
  "eventType": "order.created",
  "eventVersion": "1.0.0",
  "occurredAt": "2026-06-09T00:01:00Z",
  "correlationId": "smoke-2",
  "producer": "order-service",
  "data": {
    "orderId": "06940000-0000-7000-8000-00000000a001",
    "customerId": "47913fd3-7bf9-4182-9d94-6144ddb74cfe",
    "pickup":  { "label": "Warehouse 3", "street": "12 Dock Rd", "city": "Manila", "country": "PH", "lat": 14.5547, "lng": 120.9772 },
    "dropoff": { "street": "9 Ayala Ave", "city": "Makati", "country": "PH", "lat": 14.5547, "lng": 121.0244 },
    "items": [ { "description": "Sealed parcel", "quantity": 2 } ],
    "scheduledFor": null
  }
}
```

Now confirm in the DB (or via `GET` in §5) that the assignment exists and is **offered**:

```bash
docker compose exec -T dispatch-postgres psql -U dispatch -d dispatch \
  -c "select status, assigned_driver_id, offer_attempts from assignments;"
# expect: offered | (null) | 1
docker compose exec -T dispatch-postgres psql -U dispatch -d dispatch \
  -c "select driver_id, attempt_no, outcome from assignment_attempts order by attempt_no;"
# expect: 04940000-...d01 | 1 | offered
```

---

## 5. Exercise the HTTP API

Using `dispatch-service.http` (click "Send Request") or curl. `@orderId` = `06940000-…a001`. Happy path:

| # | Action | Expect |
|---|---|---|
| 1 | `GET /dispatch/assignments/{orderId}` (admin) | **200**, `status:"offered"`, `attempts[0].driverId = …d01` |
| 2 | `GET /dispatch/assignments/{orderId}` (the offered driver) | **200** (admin or the involved driver only) |
| 3 | `POST /dispatch/assignments/{orderId}/accept` (driver …d01) | **204**; status → `assigned`; publishes `dispatch.driver.assigned` |
| 4 | `GET /dispatch/drivers/available` (admin) | **200**, `{ items: [...] }` (the accepted driver is now busy, so absent) |

curl example for step 3:

```bash
TOKEN="<paste DRIVER JWT (sub = …d01)>"
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  localhost:3004/dispatch/assignments/06940000-0000-7000-8000-00000000a001/accept \
  -H "authorization: Bearer $TOKEN"      # 204
```

**Reject instead of accept** (re-publish STEP 1 for a fresh order to try): `POST …/reject` with `{ "reason": "too far" }` → **204**, status back to `awaiting_driver`, the driver is freed, and the order re-attempts (parks if no other driver).

**Observe what dispatch publishes:** in the RabbitMQ UI, **Queues → Add a queue** (e.g. `probe`), bind it to `logistics.events` with routing key `dispatch.driver.assigned` (and another for `dispatch.assignment.failed`), then accept an offer → one `dispatch.driver.assigned` lands in `probe`.

---

## 6. Offer expiry, park-and-retry, free-on-completion

| Scenario | How | Expect |
|---|---|---|
| **Offer expiry (TTL+DLX)** | Set `DISPATCH_OFFER_TTL_SECONDS=5`, restart, run §4 STEP 1+2, do **not** accept | after ~5s the message round-trips the holding queue → `dispatch.offer.expired` → status back to `awaiting_driver`, `attempts[0].outcome = "expired"`, `offer_attempts` stays 1 |
| **Park (empty pool)** | Run §4 STEP 2 only (no driver available) | status `awaiting_driver`, no offer made |
| **Park → assign** | After parking, run §4 STEP 1 (make a driver available) | the parked order is retried → `offered` |
| **Fail (exhaustion)** | Reject (or expire) 3 distinct offers | status `failed`, publishes `dispatch.assignment.failed` `{orderId, reason:"all_offers_rejected"}` |
| **Free on completion** | Drive an order to `assigned`, then publish `delivery.completed` `{orderId}` | the driver returns to `GET /dispatch/drivers/available` |
| **Free on cancellation** | On an `assigned`/`offered` order, publish `order.cancelled` `{orderId, customerId, previousStatus, reason}` | driver freed; the order's assignment is `cancelled` |

`delivery.completed` envelope (routing key `delivery.completed`):

```json
{
  "eventId": "07940000-0000-7000-8000-cccccccccccc",
  "eventType": "delivery.completed",
  "eventVersion": "1.0.0",
  "occurredAt": "2026-06-09T00:30:00Z",
  "correlationId": "smoke-3",
  "producer": "tracking-service",
  "data": { "orderId": "06940000-0000-7000-8000-00000000a001" }
}
```

**Idempotency probe:** publish the same `delivery.completed` (same `eventId`) twice → the second is a no-op (`processed_events` dedups; the driver isn't double-freed). Confirm:

```bash
docker compose exec -T dispatch-postgres psql -U dispatch -d dispatch \
  -c "select event_type, count(*) from processed_events group by event_type;"
```

---

## 7. Negative paths (error shapes)

Run the "Negative-path probes" block in `dispatch-service.http`. Expected:

| Probe | Expect |
|---|---|
| No `Authorization` header | **401** |
| Bogus JWT | **401** |
| `accept` by a driver who is NOT the offered one | **403** |
| `accept` when the order is not `offered` (already assigned / awaiting) | **409** |
| `accept` with a `customer`-role JWT | **403** (role guard) |
| `force-assign` by a non-admin | **403** |
| `force-assign` an unknown driver (stub returns 404) | **422** |
| `force-assign` with a non-uuid `driverId` | **400** |
| `force-assign` an already-`assigned` order | **409** |
| `GET` an assignment as an unrelated driver | **403** |
| `GET` a nonexistent assignment (admin) | **404** |
| `GET /dispatch/drivers/available` as a non-admin | **403** |

All errors are `application/problem+json` (RFC 7807) with `type`, `title`, `status`, `instance`.

> **force-assign** is allowed only from `awaiting_driver` or `failed` (never `offered`/`assigned`/`completed`/`cancelled`) and requires the driver to be resolvable via the directory (§1) — so run the stub or user-service for the 204 case.

---

## 8. "Looks good" checklist

- [ ] `healthz` 200, `readyz` 200 (Postgres + RabbitMQ + Redis).
- [ ] STEP 1 + STEP 2 → an `offered` assignment with one `offered` attempt for your driver.
- [ ] Driver accept → `assigned` + a `dispatch.driver.assigned` published; reject → back to `awaiting_driver` + driver freed.
- [ ] Offer expiry (short TTL) re-parks the order with `outcome="expired"` (proves the TTL+DLX holding queue works).
- [ ] Empty-pool order parks, then a `driver.availability.changed(true)` retries it to `offered`.
- [ ] 3 rejected/expired offers → `failed` + `dispatch.assignment.failed`.
- [ ] `delivery.completed` / `order.cancelled` free the driver back into `drivers/available`; duplicates are no-ops.
- [ ] Every negative probe returns the status in the table (no hangs).

---

## 9. Teardown

```bash
# Ctrl-C the `npm run dev` and the driver-stub
docker compose down                 # dev Postgres + Redis
# leave logistics-rabbitmq running (shared); only remove a broker you started yourself
```

---

### Notes / gotchas
- **No `/v1`** when hitting dispatch directly (`:3004/dispatch/...`). The gateway adds `/v1` in production.
- **Assignments are event-born.** There is no HTTP create; publish `order.created` (and `driver.availability.changed` for a free driver) to make one.
- **The hot offer path never calls user-service.** Only `force-assign` and the `drivers/available` enrichment resolve driver profiles — so §1 is optional.
- **`driver.availability.changed` carries `userId`, not `driverId`** — and the driver JWT's `sub` must equal it for that driver to accept.
- The real producers (`order.created` from order-service; `driver.availability.changed` from user-service; `delivery.completed` from tracking-service, Phase 5) replace the RabbitMQ-UI stand-in as those services come online.
