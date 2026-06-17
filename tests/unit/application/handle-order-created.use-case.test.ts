import { HandleOrderCreatedUseCase } from "@/application/dispatch/handle-order-created.use-case.js";
import { DispatchOrderUseCase } from "@/application/dispatch/dispatch-order.use-case.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import {
  FakeAssignmentRepository, FakeProcessedEventRepository, FakeUnitOfWork, FakeEventPublisher,
  FixedClock, FakeDriverPool, FakeOfferScheduler,
} from "./_fakes.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const OID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const input = () => ({
  eventId: "018f4e1a-eeee-7c3d-8e4f-5a6b7c8d9e0f",
  orderId: OID, customerId: "c1",
  pickup: { street: "1", city: "M", country: "PH", lat: 1, lng: 1 },
  dropoff: { street: "2", city: "M", country: "PH", lat: 2, lng: 2 },
  items: [],
  scheduledFor: null,
});

function build() {
  const assignments = new FakeAssignmentRepository();
  const processed = new FakeProcessedEventRepository();
  const uow = new FakeUnitOfWork(assignments, processed);
  const pool = new FakeDriverPool();
  const scheduler = new FakeOfferScheduler();
  const events = new FakeEventPublisher();
  const clock = new FixedClock(NOW);
  const dispatch = new DispatchOrderUseCase(assignments, pool, scheduler, events, clock, () => "att", 3, 30);
  const sut = new HandleOrderCreatedUseCase(uow, dispatch, clock);
  return { assignments, processed, pool, scheduler, events, sut };
}

describe("HandleOrderCreatedUseCase", () => {
  it("creates an awaiting assignment then offers to an available driver", async () => {
    const { assignments, pool, scheduler, sut } = build();
    await pool.onWilling(DriverId.of(D1), 1000);
    await sut.execute(input(), "corr-1");
    const a = await assignments.byId(OrderId.of(OID));
    expect(a!.status).toBe(AssignmentStatus.OFFERED);
    expect(scheduler.scheduled).toHaveLength(1);
  });

  it("is idempotent — a duplicate eventId neither recreates nor re-offers", async () => {
    const { assignments, processed, scheduler, sut } = build();
    await sut.execute(input(), "corr-1");                 // first: creates, parks (no driver)
    const before = await assignments.byId(OrderId.of(OID));
    await sut.execute(input(), "corr-1");                 // duplicate
    expect(processed.seen.size).toBe(1);
    expect(scheduler.scheduled).toHaveLength(0);
    expect((await assignments.byId(OrderId.of(OID)))!.createdAt).toEqual(before!.createdAt);
  });

  it("projects order.created items onto the saved assignment", async () => {
    const { assignments, sut } = build();
    await sut.execute(
      {
        eventId: "018f4e1a-00ee-7c3d-8e4f-5a6b7c8d9e0f",
        orderId: "018f4e1a-00aa-7c3d-8e4f-5a6b7c8d9e0f",
        customerId: "018f4e1a-00bb-7c3d-8e4f-5a6b7c8d9e0f",
        pickup: { street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 121.0 },
        dropoff: { street: "2 Main", city: "Manila", country: "PH", lat: 14.7, lng: 121.1 },
        items: [{ description: "box", quantity: 3 }],
        scheduledFor: null,
      },
      "corr-items",
    );

    const saved = assignments.store.get("018f4e1a-00aa-7c3d-8e4f-5a6b7c8d9e0f")!;
    expect(saved.items.map((i) => i.toJSON())).toEqual([{ description: "box", quantity: 3, weightKg: null }]);
  });
});
