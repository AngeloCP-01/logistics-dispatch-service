import { AcceptOfferUseCase } from "@/application/dispatch/accept-offer.use-case.js";
import { RejectOfferUseCase } from "@/application/dispatch/reject-offer.use-case.js";
import { DispatchOrderUseCase } from "@/application/dispatch/dispatch-order.use-case.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { DriverAssigned } from "@/domain/events/index.js";
import { AssignmentNotFoundError, NotOfferedDriverError } from "@/domain/shared/errors.js";
import {
  FakeAssignmentRepository, FakeEventPublisher, FixedClock, FakeDriverPool, FakeOfferScheduler,
} from "./_fakes.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const OID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";
const addr = (n: number) => AddressSnapshot.of({ street: `${n}`, city: "M", country: "PH", lat: n, lng: n });

async function offered() {
  const assignments = new FakeAssignmentRepository();
  const pool = new FakeDriverPool();
  const events = new FakeEventPublisher();
  const dispatch = new DispatchOrderUseCase(assignments, pool, new FakeOfferScheduler(), events, new FixedClock(NOW), () => "att", 3, 30);
  const a = Assignment.fromOrderCreated({ orderId: OrderId.of(OID), customerId: "c1", pickup: addr(1), dropoff: addr(2), scheduledFor: null }, NOW);
  a.offerTo("att-1", DriverId.of(D1), NOW, new Date(NOW.getTime() + 30000));
  await assignments.save(a);
  await pool.markBusy(DriverId.of(D1));
  return { assignments, pool, events, dispatch };
}

describe("AcceptOfferUseCase", () => {
  it("assigns and publishes DriverAssigned", async () => {
    const { assignments, events, dispatch } = await offered();
    const sut = new AcceptOfferUseCase(assignments, events, new FixedClock(NOW));
    await sut.execute({ orderId: OID, driverId: D1 }, "corr-1");
    expect((await assignments.byId(OrderId.of(OID)))!.status).toBe(AssignmentStatus.ASSIGNED);
    expect(events.published[0]).toBeInstanceOf(DriverAssigned);
    void dispatch;
  });
  it("rejects accept by the wrong driver (403)", async () => {
    const { assignments, events } = await offered();
    const sut = new AcceptOfferUseCase(assignments, events, new FixedClock(NOW));
    await expect(sut.execute({ orderId: OID, driverId: D2 }, "c")).rejects.toThrow(NotOfferedDriverError);
  });
  it("404 when the assignment is unknown", async () => {
    const { assignments, events } = await offered();
    const sut = new AcceptOfferUseCase(assignments, events, new FixedClock(NOW));
    await expect(sut.execute({ orderId: "018f4e1a-9999-7c3d-8e4f-5a6b7c8d9e0f", driverId: D1 }, "c"))
      .rejects.toThrow(AssignmentNotFoundError);
  });
});

describe("RejectOfferUseCase", () => {
  it("frees the driver and re-attempts (parks when no other driver)", async () => {
    const { assignments, pool, dispatch } = await offered();
    const sut = new RejectOfferUseCase(assignments, pool, dispatch, new FixedClock(NOW));
    await sut.execute({ orderId: OID, driverId: D1, reason: "busy" }, "corr-1");
    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(a!.triedDriverIds()).toEqual([D1]);
    expect(pool.busy.has(D1)).toBe(false);
  });
});
