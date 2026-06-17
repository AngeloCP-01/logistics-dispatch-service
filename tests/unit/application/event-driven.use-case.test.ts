import { ExpireOfferUseCase } from "@/application/dispatch/expire-offer.use-case.js";
import { CompleteDeliveryUseCase } from "@/application/dispatch/complete-delivery.use-case.js";
import { CancelOrderUseCase } from "@/application/dispatch/cancel-order.use-case.js";
import { DispatchOrderUseCase } from "@/application/dispatch/dispatch-order.use-case.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import {
  FakeAssignmentRepository, FakeProcessedEventRepository, FakeUnitOfWork, FakeEventPublisher,
  FixedClock, FakeDriverPool, FakeOfferScheduler,
} from "./_fakes.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const OID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const EID = "018f4e1a-eeee-7c3d-8e4f-5a6b7c8d9e0f";
const addr = (n: number) => AddressSnapshot.of({ street: `${n}`, city: "M", country: "PH", lat: n, lng: n });

function build() {
  const assignments = new FakeAssignmentRepository();
  const processed = new FakeProcessedEventRepository();
  const pool = new FakeDriverPool();
  const events = new FakeEventPublisher();
  const clock = new FixedClock(NOW);
  const dispatch = new DispatchOrderUseCase(assignments, pool, new FakeOfferScheduler(), events, clock, () => "att", 3, 30);
  return { assignments, processed, pool, events, clock, dispatch };
}

function newAssignment() {
  return Assignment.fromOrderCreated(
    { orderId: OrderId.of(OID), customerId: "c1", pickup: addr(1), dropoff: addr(2), items: [], scheduledFor: null }, NOW);
}

async function offered(assignments: FakeAssignmentRepository, pool: FakeDriverPool) {
  const a = newAssignment();
  a.offerTo("att-1", DriverId.of(D1), NOW, new Date(NOW.getTime() + 30000));
  await assignments.save(a);
  await pool.markBusy(DriverId.of(D1));
  return a;
}

async function assigned(assignments: FakeAssignmentRepository, pool: FakeDriverPool) {
  const a = newAssignment();
  a.offerTo("att-1", DriverId.of(D1), NOW, new Date(NOW.getTime() + 30000));
  a.accept(DriverId.of(D1), NOW);
  await assignments.save(a);
  await pool.markBusy(DriverId.of(D1));
  return a;
}

describe("ExpireOfferUseCase", () => {
  it("expires the current offer → awaiting_driver and frees the driver", async () => {
    const { assignments, pool, dispatch, clock } = build();
    await offered(assignments, pool);
    const sut = new ExpireOfferUseCase(assignments, pool, dispatch, clock);

    await sut.execute({ orderId: OID, attemptNo: 1 }, "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(pool.busy.has(D1)).toBe(false);
  });

  it("is a no-op for a stale attemptNo", async () => {
    const { assignments, pool, dispatch, clock } = build();
    await offered(assignments, pool);
    const sut = new ExpireOfferUseCase(assignments, pool, dispatch, clock);

    await sut.execute({ orderId: OID, attemptNo: 2 }, "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.OFFERED);
    expect(pool.busy.has(D1)).toBe(true);
  });
});

describe("CompleteDeliveryUseCase", () => {
  it("completes an assigned order and frees the driver", async () => {
    const { assignments, processed, pool, dispatch, clock } = build();
    await assigned(assignments, pool);
    const uow = new FakeUnitOfWork(assignments, processed);
    const sut = new CompleteDeliveryUseCase(uow, pool, dispatch, clock);

    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.COMPLETED);
    expect(pool.busy.has(D1)).toBe(false);
  });

  it("is idempotent on a duplicate eventId", async () => {
    const { assignments, processed, pool, dispatch, clock } = build();
    await assigned(assignments, pool);
    const uow = new FakeUnitOfWork(assignments, processed);
    const sut = new CompleteDeliveryUseCase(uow, pool, dispatch, clock);

    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");
    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");   // duplicate

    expect(processed.seen.size).toBe(1);
    expect((await assignments.byId(OrderId.of(OID)))!.status).toBe(AssignmentStatus.COMPLETED);
  });
});

describe("CancelOrderUseCase", () => {
  it("cancels an assigned order and frees the driver", async () => {
    const { assignments, processed, pool, dispatch, clock } = build();
    await assigned(assignments, pool);
    const uow = new FakeUnitOfWork(assignments, processed);
    const sut = new CancelOrderUseCase(uow, pool, dispatch, clock);

    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");

    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.CANCELLED);
    expect(pool.busy.has(D1)).toBe(false);
  });

  it("is idempotent on a duplicate eventId", async () => {
    const { assignments, processed, pool, dispatch, clock } = build();
    await assigned(assignments, pool);
    const uow = new FakeUnitOfWork(assignments, processed);
    const sut = new CancelOrderUseCase(uow, pool, dispatch, clock);

    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");
    await sut.execute({ eventId: EID, orderId: OID }, "corr-1");   // duplicate

    expect(processed.seen.size).toBe(1);
    expect((await assignments.byId(OrderId.of(OID)))!.status).toBe(AssignmentStatus.CANCELLED);
  });
});
