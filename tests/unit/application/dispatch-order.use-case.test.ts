import { DispatchOrderUseCase } from "@/application/dispatch/dispatch-order.use-case.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { AssignmentFailed } from "@/domain/events/index.js";
import {
  FakeAssignmentRepository, FakeEventPublisher, FixedClock, FakeDriverPool, FakeOfferScheduler,
} from "./_fakes.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const OID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const addr = (n: number) => AddressSnapshot.of({ street: `${n}`, city: "M", country: "PH", lat: n, lng: n });

function setup() {
  const assignments = new FakeAssignmentRepository();
  const pool = new FakeDriverPool();
  const scheduler = new FakeOfferScheduler();
  const events = new FakeEventPublisher();
  const sut = new DispatchOrderUseCase(assignments, pool, scheduler, events, new FixedClock(NOW), () => "att-id", 3, 30);
  return { assignments, pool, scheduler, events, sut };
}
function park(_assignments: FakeAssignmentRepository, attempts = 0) {
  const a = Assignment.fromOrderCreated(
    { orderId: OrderId.of(OID), customerId: "c1", pickup: addr(1), dropoff: addr(2), items: [], scheduledFor: null }, NOW);
  for (let i = 0; i < attempts; i++) {
    const d = DriverId.of(`018f4e1a-00${(i + 10).toString().padStart(2, "0")}-7c3d-8e4f-5a6b7c8d9e0f`);
    a.offerTo(`att-${i}`, d, NOW, NOW); a.rejectByDriver(d, NOW);
  }
  return a;
}

describe("DispatchOrderUseCase.attempt", () => {
  it("offers the awaiting order to a free driver and schedules expiry", async () => {
    const { assignments, pool, scheduler, sut } = setup();
    await assignments.save(park(assignments));
    await pool.onWilling(DriverId.of(D1), 1000);

    await sut.attempt(OrderId.of(OID), "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.OFFERED);
    expect(a!.currentAttempt()!.driverId).toBe(D1);
    expect(scheduler.scheduled).toEqual([{ orderId: OID, attemptNo: 1, ttlSeconds: 30 }]);
    expect(pool.busy.has(D1)).toBe(true);
  });

  it("parks (no offer, no fail) when the pool is empty", async () => {
    const { assignments, scheduler, sut } = setup();
    await assignments.save(park(assignments));

    await sut.attempt(OrderId.of(OID), "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(scheduler.scheduled).toHaveLength(0);
  });

  it("does not re-offer a driver already in the tried set", async () => {
    const { assignments, pool, sut } = setup();
    await assignments.save(park(assignments, 1));      // one driver already rejected
    const tried = (await assignments.byId(OrderId.of(OID)))!.triedDriverIds()[0];
    await pool.onWilling(tried, 1000);                 // the tried driver is the only one available

    await sut.attempt(OrderId.of(OID), "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.AWAITING_DRIVER);   // stayed parked, not re-offered
  });
});

describe("DispatchOrderUseCase.failOrRetry", () => {
  it("fails + publishes when offer attempts reach the max", async () => {
    const { assignments, events, sut } = setup();
    await assignments.save(park(assignments, 3));      // 3 rejected offers, status awaiting_driver

    await sut.failOrRetry(OrderId.of(OID), "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.FAILED);
    expect(events.published[0]).toBeInstanceOf(AssignmentFailed);
  });

  it("re-attempts (not fail) when below max", async () => {
    const { assignments, pool, sut } = setup();
    await assignments.save(park(assignments, 1));
    await pool.onWilling(DriverId.of(D1), 1000);

    await sut.failOrRetry(OrderId.of(OID), "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.OFFERED);
  });
});
