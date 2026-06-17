# logistics-dispatch-service — Repo Guide

> Matches each order to one driver via an offer-and-wait flow. No geo in V1.

**Phase:** 4 (Dispatch Service)
**Status:** ✅ v0.1.0 shipped (2026-06-08) — CI green, image `ghcr.io/angelocp-01/dispatch-service:latest` + `:<sha>` published, runtime healthcheck verified.

## What this service does

Consumes `order.created`, picks the longest-waiting available driver from a FIFO pool, and **offers** the delivery to that driver. The driver accepts or rejects over HTTP. If the offer is not accepted within a TTL it **expires** and the order is re-offered to the next driver. When no driver is free the order is **parked** (`awaiting_driver`) and re-dispatched event-driven as drivers free up. After 3 distinct rejected/expired offers the order **fails** (`dispatch.assignment.failed`). On accept it emits `dispatch.driver.assigned`.

**No geo in V1.** Nothing in the platform produces driver coordinates (`driver.availability.changed` is `{userId, isAvailable, changedAt}`; user-service stores no location; tracking emits no driver location). Selection is therefore **non-geographic** — FIFO by availability time. No PostGIS, no Redis GEO.

## Locked decisions (shipped reality — see spec for rationale)

- **Selection**: FIFO available-pool, longest-waiting first. One delivery per driver at a time.
- **Offer flow**: offer-and-wait (accept/reject over HTTP). Accept-timeout fires via a **self-published delayed RabbitMQ message** (plugin-free TTL+DLX holding queue — the platform broker is stock `rabbitmq:3.13`, no `x-delayed-message` plugin).
- **Settle-then-publish**: `dispatch.driver.assigned` is published after the assignment is persisted (dodges order-service's monotonic-rank no-op on a 2nd `assigned`).
- **Park-and-retry** on empty pool; **fail** only on rejection/expiry exhaustion (3 attempts).
- **Free a busy driver** on `delivery.completed` and `order.cancelled`.
- **Admin force-assign** is for unassigned/parked/failed orders only (never in-flight — the monotonic-rank wrinkle).
- **Disconnect-reassignment deferred to V2** (no disconnect/heartbeat signal exists in V1).
- **Sync `dispatch → user-service`** is scoped tight: NOT on the hot offer path (pool membership already implies a valid driver) — only for force-assign validation + the available-drivers read enrichment, via service JWT (`X-Service-Authorization`).

- **Events consumed**: `order.created`, `driver.availability.changed`, `delivery.completed`, `order.cancelled`, and the internal `dispatch.offer.expired` (the TTL+DLX expiry message).
- **Events published**: `dispatch.driver.assigned` `{orderId, driverId}`, `dispatch.assignment.failed` `{orderId, reason: "all_offers_rejected"}`.
- **Public endpoints** (mounted under `/v1/dispatch`; the gateway forwards `/v1` pass-through — it does not add or strip it):
  - `GET /v1/dispatch/assignments/{orderId}` (admin or the involved driver)
  - `POST /v1/dispatch/assignments/{orderId}/accept` (driver)
  - `POST /v1/dispatch/assignments/{orderId}/reject` (driver)
  - `POST /v1/dispatch/assignments/{orderId}/force-assign` (admin)
  - `GET /v1/dispatch/offers/current` (driver — the caller's current outstanding offer; `204` if none)
  - `GET /v1/dispatch/drivers/available` (admin)
  - `GET /healthz` (liveness) + `GET /readyz` (Postgres + RabbitMQ channel + Redis ping)

## Architecture

Standard layered Node/TS service (`domain → application → infrastructure → interfaces`, conventions §2.1). Composition root in `src/server.ts` (attributed `BootError`/`bootStep` for Postgres + Redis + RabbitMQ + topology + consumer + HTTP bind; SIGTERM graceful shutdown). `--healthcheck` flag short-circuits before any dependency connection.

## Database (Neon Postgres, Prisma)

- `assignments` — `order_id` (PK, uuid), `customer_id`, `status` (`awaiting_driver|offered|assigned|completed|cancelled|failed`), `pickup`/`dropoff` (Json snapshots), `items` (Json — order line-items snapshot, projected from `order.created`), `scheduled_for?`, `assigned_driver_id?`, `offer_attempts`, `created_at`, `updated_at`.
- `assignment_attempts` — `id` (uuid), `order_id` (FK, cascade), `driver_id`, `attempt_no`, `outcome` (`offered|accepted|rejected|expired`), `offered_at`, `responded_at?`, `expires_at`.
- `processed_events` — `event_id` (PK, uuid), `event_type`, `processed_at` (consumer idempotency; check+side-effect+record in one tx).

The `Assignment` aggregate owns the state machine; mutations go through named methods (`offerTo`/`accept`/`rejectByDriver`/`expireOffer`/`markFailed`/`markCompleted`/`cancel`/`forceAssign`). `expireOffer` and `markCompleted` are idempotent/out-of-order-safe.

## Redis usage (three structures, atomic Lua)

The pool is **three** structures with atomic Lua ops (NOT a single per-driver lock key):
- `dispatch:drivers:willing` — SET of drivers who toggled available.
- `dispatch:drivers:available` — ZSET scored by available-since ms (FIFO).
- `dispatch:drivers:busy` — SET of drivers currently on an offer/delivery.

`claimNext` atomically takes the lowest-score willing+free driver (excluding already-tried) and moves them to busy. `onWilling` enqueues only if not busy; `freeDriver` re-enqueues only if still willing. This cleanly handles a driver toggling available mid-delivery.

## Conventions

- Same as platform: pino, Zod, `/healthz` + `/readyz`, RFC 7807, Conventional Commits. Env prefix `DISPATCH_*` (cross-cutting `RABBITMQ_URL`/`REDIS_URL`/`LOG_LEVEL` unprefixed).
- `JWT_SECRET` verifies inbound user JWTs (= auth's `AUTH_JWT_SECRET`); `SERVICE_JWT_SECRET` signs the outbound service JWT to user-service (= user-service's secret, MUST differ from `JWT_SECRET` — enforced by the env-schema refine).
- Offer-loop tuning: `DISPATCH_OFFER_TTL_SECONDS` (default 30), `DISPATCH_MAX_OFFER_ATTEMPTS` (default 3).
- Local dev ports: HTTP `3004`, dev Postgres `5437` (avoid order-service `3003`/`5436`).
- Shared TS/ESLint/Prettier configs are **vendored** (conventions §22), not imported.

## Testing

- **73 unit tests** (strict TDD on `domain/` + `application/`; in-memory fakes for ports).
- **23 integration tests** (testcontainers: real Postgres + RabbitMQ + Redis) — Redis pool atomicity/FIFO, the **real TTL+DLX offer-expiry round-trip**, the consumer wiring, HTTP authz, readyz dependency-down probes. The integration tests caught two real wire bugs the unit fakes missed (the `driver.availability.changed` `userId→driverId` boundary mapping; the missing `eventId` for `order.created` idempotency) — both fixed at the consumer boundary.
- `npm test` (unit), `npm run test:int` (needs Docker), `npm run typecheck`, `npm run lint`.

## Don't do

- Don't add geo/location to selection — V1 has no driver-location producer. Pool is FIFO by availability time.
- Don't store driver location here (that's tracking-service). The pool scores availability time, not position.
- Don't put the user-service lookup on the hot offer path — pool membership already implies a valid driver.
- Don't force-assign an in-flight (`offered`/`assigned`) order — only unassigned/parked/failed.
- Don't publish a 2nd `dispatch.driver.assigned` for the same order — settle-then-publish, once per assignment.
- Don't use the `x-delayed-message` plugin — the offer-expiry delay is per-message TTL + DLX on a holding queue.

## Follow-ups (non-blocking)

- **Render**: dispatch-service is not yet in `logistics-infrastructure/render.yaml` (deploy blueprint). Add before the Phase 7 demo.
- **Minor (deferred polish, see Phase 4 retro)**: `cancel-order` runs `retryParked` unconditionally even on a duplicate-eventId no-op (harmless; align with `complete-delivery`'s guard); add a use-case-level test for "cancel of an OFFERED order frees the offered driver" (domain-tested + integration-covered, but not unit-tested at the use-case layer).

## Pointers

- Spec: [`../docs/superpowers/specs/2026-06-05-dispatch-service-design.md`](../docs/superpowers/specs/2026-06-05-dispatch-service-design.md)
- Plan: [`../docs/superpowers/plans/2026-06-05-phase-4-dispatch-service.md`](../docs/superpowers/plans/2026-06-05-phase-4-dispatch-service.md)
- OpenAPI: [`../logistics-contracts/openapi/dispatch-service.yaml`](../logistics-contracts/openapi/dispatch-service.yaml)
- Local exercise file (REST Client): [`docs/dispatch-service.http`](docs/dispatch-service.http)
- Manual testing guide: [`docs/manual-testing-guide.md`](docs/manual-testing-guide.md)
- Retro: [`../docs/superpowers/retros/4-dispatch-service.md`](../docs/superpowers/retros/4-dispatch-service.md)
- Tracker: [`../docs/superpowers/tracker.md`](../docs/superpowers/tracker.md)
