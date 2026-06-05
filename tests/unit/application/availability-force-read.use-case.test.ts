import { UpdateAvailabilityUseCase } from "@/application/dispatch/update-availability.use-case.js";
import { ForceAssignUseCase } from "@/application/dispatch/force-assign.use-case.js";
import { ListAvailableDriversUseCase } from "@/application/dispatch/list-available-drivers.use-case.js";
import { DispatchOrderUseCase } from "@/application/dispatch/dispatch-order.use-case.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { DriverAssigned } from "@/domain/events/index.js";
import { DriverNotAssignableError, ForceAssignNotAllowedError } from "@/domain/shared/errors.js";
import type { DriverInfo } from "@/application/ports/driver-directory.js";
import {
  FakeAssignmentRepository, FakeProcessedEventRepository, FakeUnitOfWork, FakeEventPublisher,
  FixedClock, FakeDriverPool, FakeOfferScheduler, FakeDriverDirectory,
} from "./_fakes.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const OID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";
const EID = "018f4e1a-eeee-7c3d-8e4f-5a6b7c8d9e0f";
const addr = (n: number) => AddressSnapshot.of({ street: `${n}`, city: "M", country: "PH", lat: n, lng: n });

function build() {
  const assignments = new FakeAssignmentRepository();
  const processed = new FakeProcessedEventRepository();
  const uow = new FakeUnitOfWork(assignments, processed);
  const pool = new FakeDriverPool();
  const events = new FakeEventPublisher();
  const clock = new FixedClock(NOW);
  const dispatch = new DispatchOrderUseCase(assignments, pool, new FakeOfferScheduler(), events, clock, () => "att", 3, 30);
  return { assignments, processed, uow, pool, events, clock, dispatch };
}

function parkedOrder() {
  return Assignment.fromOrderCreated(
    { orderId: OrderId.of(OID), customerId: "c1", pickup: addr(1), dropoff: addr(2), scheduledFor: null }, NOW);
}

describe("UpdateAvailabilityUseCase", () => {
  it("isAvailable=true adds to the pool and retries parked orders → offered", async () => {
    const { assignments, uow, pool, dispatch } = build();
    await assignments.save(parkedOrder());                 // awaiting_driver, no driver
    const sut = new UpdateAvailabilityUseCase(uow, pool, dispatch);

    await sut.execute({ eventId: EID, driverId: D1, isAvailable: true, changedAt: NOW.toISOString() }, "corr-1");

    // retryParked claims the now-willing driver to offer the parked order → D1 is busy, order offered
    expect(pool.busy.has(D1)).toBe(true);
    expect((await assignments.byId(OrderId.of(OID)))!.status).toBe(AssignmentStatus.OFFERED);
  });

  it("isAvailable=false removes the driver from the pool", async () => {
    const { uow, pool, dispatch } = build();
    await pool.onWilling(DriverId.of(D1), NOW.getTime());
    const sut = new UpdateAvailabilityUseCase(uow, pool, dispatch);

    await sut.execute({ eventId: EID, driverId: D1, isAvailable: false, changedAt: NOW.toISOString() }, "corr-1");

    expect(pool.available.has(D1)).toBe(false);
    expect(pool.willing.has(D1)).toBe(false);
  });

  it("is idempotent on a duplicate eventId", async () => {
    const { processed, uow, pool, dispatch } = build();
    const sut = new UpdateAvailabilityUseCase(uow, pool, dispatch);

    await sut.execute({ eventId: EID, driverId: D1, isAvailable: true, changedAt: NOW.toISOString() }, "corr-1");
    await sut.execute({ eventId: EID, driverId: D2, isAvailable: true, changedAt: NOW.toISOString() }, "corr-1");

    expect(processed.seen.size).toBe(1);
    expect(pool.available.has(D2)).toBe(false);            // second event was ignored
  });
});

describe("ForceAssignUseCase", () => {
  const directory = (entries: [string, DriverInfo][]) => new FakeDriverDirectory(new Map(entries));
  const known = (): [string, DriverInfo] =>
    [D1, { driverId: DriverId.of(D1), displayName: "Dana", vehicleType: "car" }];

  it("rejects a driver unknown to the directory (422)", async () => {
    const { assignments, pool, events, clock } = build();
    await assignments.save(parkedOrder());
    const sut = new ForceAssignUseCase(assignments, pool, directory([]), events, clock);

    await expect(sut.execute({ orderId: OID, driverId: D1 }, "corr-1"))
      .rejects.toThrow(DriverNotAssignableError);
  });

  it("assigns a valid driver to an awaiting order and publishes DriverAssigned", async () => {
    const { assignments, pool, events, clock } = build();
    await assignments.save(parkedOrder());
    const sut = new ForceAssignUseCase(assignments, pool, directory([known()]), events, clock);

    await sut.execute({ orderId: OID, driverId: D1 }, "corr-1");

    expect((await assignments.byId(OrderId.of(OID)))!.status).toBe(AssignmentStatus.ASSIGNED);
    expect(events.published[0]).toBeInstanceOf(DriverAssigned);
    expect(pool.busy.has(D1)).toBe(true);
  });

  it("rejects force-assign on an already-assigned order (409)", async () => {
    const { assignments, pool, events, clock } = build();
    const a = parkedOrder();
    a.offerTo("att-1", DriverId.of(D1), NOW, new Date(NOW.getTime() + 30000));
    a.accept(DriverId.of(D1), NOW);
    await assignments.save(a);
    const sut = new ForceAssignUseCase(assignments, pool, directory([known()]), events, clock);

    await expect(sut.execute({ orderId: OID, driverId: D1 }, "corr-1"))
      .rejects.toThrow(ForceAssignNotAllowedError);
  });
});

describe("ListAvailableDriversUseCase", () => {
  it("enriches pool entries with directory info", async () => {
    const { pool } = build();
    await pool.onWilling(DriverId.of(D1), NOW.getTime());
    const directory = new FakeDriverDirectory(new Map([
      [D1, { driverId: DriverId.of(D1), displayName: "Dana", vehicleType: "car" }],
    ]));
    const sut = new ListAvailableDriversUseCase(pool, directory);

    const views = await sut.execute();

    expect(views).toEqual([
      { driverId: D1, displayName: "Dana", vehicleType: "car", availableSince: NOW.toISOString() },
    ]);
  });

  it("falls back to driverId/null for a driver unknown to the directory", async () => {
    const { pool } = build();
    await pool.onWilling(DriverId.of(D2), NOW.getTime());
    const sut = new ListAvailableDriversUseCase(pool, new FakeDriverDirectory(new Map()));

    const views = await sut.execute();

    expect(views).toEqual([
      { driverId: D2, displayName: D2, vehicleType: null, availableSince: NOW.toISOString() },
    ]);
  });
});
