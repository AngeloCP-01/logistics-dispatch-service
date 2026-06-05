# logistics-dispatch-service — Repo Guide

> Driver assignment, availability tracking, dispatch logic.

**Phase:** 4 (Dispatch Service)
**Status:** ⬜ Not started — scaffold only. Brainstorm a Dispatch spec before implementation.

## What this service does

Matches orders to drivers. Watches for new orders, picks an available driver (first-available nearest in V1), and publishes the assignment. Tracks which drivers are currently online and available via a Redis set updated from `driver.availability.changed` events.

## Locked decisions

- **Tech**: Node 20 LTS, TypeScript, Express, Prisma + Neon Postgres, Redis, Jest.
- **Events consumed**: `order.created` (trigger assignment), `driver.availability.changed` (update availability set).
- **Events published**: `dispatch.driver.assigned`, `dispatch.assignment.failed`.
- **Sync HTTP outbound**: → `user-service` `/users/drivers/{id}` (resolve driver profile during assignment). Through gateway, with service JWT.
- **Public endpoints** (via gateway): `/v1/dispatch/assignments/{orderId}`, `/v1/dispatch/drivers/available`, admin-only manual dispatch endpoint, `/healthz`, `/readyz`.

## Database (Neon Postgres)

Tables (finalized in Dispatch spec):
- `assignments` — id, order_id, driver_id, status (pending, accepted, rejected, completed), created_at, accepted_at, rejected_at.
- `assignment_attempts` — id, order_id, driver_id, attempt_no, outcome, attempted_at.

## Redis usage

- `dispatch:drivers:available` — sorted set of driver IDs scored by last-seen timestamp.
- `dispatch:driver:{id}:lock` — short-lived lock during an assignment attempt (prevents double-assignment).

## Conventions

- Same as platform: pino, Zod, `/healthz` + `/readyz`, RFC 7807, Conventional Commits.
- Env prefix: `DISPATCH_*`.
- Assignment is **transactional**: lock driver in Redis, insert assignment row, publish event — all-or-nothing.
- Assignment retries on driver rejection: 3 attempts, then publish `dispatch.assignment.failed`.

## Open items (decide in the Dispatch spec)

- Assignment algorithm: first-available nearest? round-robin? load-balanced by active deliveries?
- Geospatial query strategy (PostGIS? in-memory Redis GEOADD? a third option?)
- Driver acceptance/rejection flow (timeout for accept? expose accept/reject endpoints here or on driver client?)
- Manual dispatch UI/API (admin override existing assignment)
- Reassignment on driver disconnect mid-delivery

## Don't do

- Don't allow two drivers to be assigned to the same `order_id` concurrently. Always lock.
- Don't subscribe to `tracking-service`'s WebSocket here. Driver availability comes from events, not realtime location.
- Don't store driver location here. That's `tracking-service`. We only track last-seen timestamps for availability scoring.
- Don't expose `assignments` write endpoints to customers. Customers interact with the order; dispatch is a side-effect.

## Pointers

- Spec: [`../docs/superpowers/specs/2026-05-18-platform-decomposition-design.md`](../docs/superpowers/specs/2026-05-18-platform-decomposition-design.md) §4.1, §4.3
- Plan: TBD (brainstorm + plan in Phase 4)
- Tracker: [`../docs/superpowers/tracker.md`](../docs/superpowers/tracker.md)
