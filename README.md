# logistics-dispatch-service

Matches each order to **one driver** for the AI Logistics & Delivery Management Platform via an **offer-and-wait** flow: consumes `order.created`, offers the delivery to the longest-waiting available driver (FIFO pool, **no geo in V1**), waits for accept/reject, expires unanswered offers, parks orders when no driver is free, and emits `dispatch.driver.assigned` / `dispatch.assignment.failed`.

**Phase:** 4 · **Status:** v0.1.0 · Node 20 / TypeScript (ESM) / Express / Prisma + Postgres / Redis / RabbitMQ.

See the design spec: [`../docs/superpowers/specs/2026-06-05-dispatch-service-design.md`](../docs/superpowers/specs/2026-06-05-dispatch-service-design.md) and plan: [`../docs/superpowers/plans/2026-06-05-phase-4-dispatch-service.md`](../docs/superpowers/plans/2026-06-05-phase-4-dispatch-service.md).

## Assignment state machine (offer-and-wait)

```
                        ┌──────────── reject / offer expiry (TTL) ───────────┐
                        ▼                                                     │
order.created ──▶ awaiting_driver ──(offer to next free driver)──▶ offered ──┘
                    │   ▲                                             │
       (empty pool) │   │ (a driver frees up → retry)                │ accept
            park ◀──┘   └────────────────────────────────────────────┤
                    │                                                 ▼
   3 rejected/expired offers ──▶ failed                            assigned ──(delivery.completed)──▶ completed
                                   │                                  │
                                   └── admin force-assign ──▶ assigned└──(order.cancelled)──▶ cancelled
```

- **No geo in V1.** Nothing produces driver coordinates, so selection is **FIFO by availability time**, not distance. No PostGIS / Redis-GEO.
- **Offer-and-wait.** A driver is offered the delivery and accepts/rejects over HTTP. An unanswered offer **expires** after a TTL and the order is re-offered to the next driver.
- **Park-and-retry.** With no free driver the order parks (`awaiting_driver`) and is re-dispatched event-driven as drivers become available. It **fails** only after 3 distinct rejected/expired offers.
- **Settle-then-publish.** `dispatch.driver.assigned` is published after the assignment is persisted (and only once per assignment).
- **Admin force-assign** is allowed for unassigned/parked/failed orders only — never in-flight.

## API surface (via the gateway, `/v1` prefix added there)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/dispatch/assignments/{orderId}` | admin or involved driver | Single assignment |
| `POST` | `/dispatch/assignments/{orderId}/accept` | driver | Accept the current offer (→ assigned) |
| `POST` | `/dispatch/assignments/{orderId}/reject` | driver | Reject the current offer (`{ reason? }`) |
| `POST` | `/dispatch/assignments/{orderId}/force-assign` | admin | Force a driver onto a parked/failed order (`{ driverId }`) |
| `GET` | `/dispatch/drivers/available` | admin | Currently-available drivers |
| `GET` | `/healthz` · `/readyz` | none | Liveness / readiness (Postgres + RabbitMQ + Redis) |

Errors are RFC 7807 Problem Details. There is **no HTTP endpoint to create an assignment** — assignments are born from the `order.created` event.

## Events

- **Publishes:** `dispatch.driver.assigned` `{ orderId, driverId }`, `dispatch.assignment.failed` `{ orderId, reason: "all_offers_rejected" }`.
- **Consumes:** `order.created` (create + offer), `driver.availability.changed` (pool membership — payload field is `userId`), `delivery.completed` (free the driver), `order.cancelled` (free the driver), and the internal `dispatch.offer.expired` (the TTL+DLX expiry message).

All events use the shared envelope from `@angelocp-01/logistics-contracts`. Event consumers are idempotent (`processed_events` dedup) and tolerate out-of-order delivery.

### Offer expiry — plugin-free delayed message

The accept-timeout uses a **per-message TTL on a no-consumer holding queue** that dead-letters back to `logistics.events` with `dispatch.offer.expired` — the plugin-free delayed-message technique. The platform broker is stock `rabbitmq:3.13` (no `x-delayed-message` plugin).

## Driver pool (Redis, FIFO, atomic Lua)

Three structures, not a per-driver lock key:

| Key | Type | Meaning |
|---|---|---|
| `dispatch:drivers:willing` | SET | drivers who toggled available |
| `dispatch:drivers:available` | ZSET (score = available-since ms) | free + willing, ordered FIFO |
| `dispatch:drivers:busy` | SET | currently on an offer / delivery |

`claimNext` atomically takes the lowest-score free driver (excluding already-tried) and marks them busy; `freeDriver` re-enqueues only if still willing. This cleanly handles a driver toggling available mid-delivery.

## Local development

```bash
docker compose up -d            # dev Postgres on :5437 (+ a Redis)
cp .env.example .env            # then fill in secrets
npm install
npm run prisma:migrate          # apply migrations to the dev DB
npm run dev                     # tsx --env-file=.env, listens on PORT (default 3004)
```

`force-assign` and the available-drivers enrichment need user-service reachable at `DISPATCH_USER_SERVICE_URL` (the gateway in real deploys) to resolve driver profiles; the hot offer path does not.

## Configuration

| Var | Purpose |
|---|---|
| `DISPATCH_DB_URL` | Postgres connection string (pooled) |
| `REDIS_URL` | Redis (the FIFO driver pool) |
| `RABBITMQ_URL` | broker (events + the offer-expiry holding queue) |
| `JWT_SECRET` | verify inbound user JWTs (HS256; = auth's `AUTH_JWT_SECRET`) |
| `SERVICE_JWT_SECRET` | mint the outbound service JWT to user-service (must differ from `JWT_SECRET`) |
| `DISPATCH_USER_SERVICE_URL` | base URL for driver-profile resolution |
| `DISPATCH_OFFER_TTL_SECONDS` | offer accept-timeout (default 30) |
| `DISPATCH_MAX_OFFER_ATTEMPTS` | offers before failing (default 3) |
| `LOG_LEVEL`, `LOG_SERVICE_NAME`, `PORT`, `NODE_ENV` | cross-cutting |

## Testing

```bash
npm test          # unit (domain + application), fast, in-memory fakes
npm run test:int  # integration via testcontainers (real Postgres + RabbitMQ + Redis)
npm run typecheck && npm run lint
```

Unit tests use in-memory fakes; integration tests exercise the real wired app + event consumer against real containers — including the **real TTL+DLX offer-expiry round-trip** and the Redis pool atomicity/FIFO (the layer that catches the wire-mapping, ESM, and async-error bugs unit tests miss).

**Manual / exploratory testing:** [`docs/manual-testing-guide.md`](docs/manual-testing-guide.md) is a step-by-step walkthrough (with an optional 30-line driver stub for `force-assign`), and [`docs/dispatch-service.http`](docs/dispatch-service.http) is a VS Code REST Client file that drives an assignment into existence (publish `order.created` + `driver.availability.changed`) and exercises every endpoint + the negative paths.

## Architecture

Clean Architecture: `src/{domain,application,infrastructure,interfaces,config}` + `server.ts` (composition root, with attributed boot errors). Dependencies point inward; `infrastructure` implements the ports declared in `domain`/`application`. The `Assignment` aggregate owns the state machine; Redis/RabbitMQ/Prisma/HTTP are adapters behind ports.
