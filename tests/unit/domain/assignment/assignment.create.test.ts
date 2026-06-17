import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { OrderItemLine } from "@/domain/shared/order-item-line.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const pickup = AddressSnapshot.of({ street: "1 A", city: "Manila", country: "PH", lat: 14.5, lng: 121.0 });
const dropoff = AddressSnapshot.of({ street: "2 B", city: "Manila", country: "PH", lat: 14.6, lng: 121.1 });

function newAssignment() {
  return Assignment.fromOrderCreated(
    { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1", pickup, dropoff, items: [], scheduledFor: null },
    NOW,
  );
}

describe("Assignment.fromOrderCreated", () => {
  it("starts awaiting_driver with zero attempts and no events", () => {
    const a = newAssignment();
    expect(a.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(a.offerAttempts).toBe(0);
    expect(a.assignedDriverId).toBeNull();
    expect(a.triedDriverIds()).toEqual([]);
    expect(a.currentAttempt()).toBeNull();
    expect(a.pullEvents()).toEqual([]);
  });

  it("carries the order items projected from order.created", () => {
    const now = new Date("2026-06-16T12:00:00.000Z");
    const a = Assignment.fromOrderCreated(
      {
        orderId: OrderId.of("018f4e1a-0000-7c3d-8e4f-5a6b7c8d9e0f"),
        customerId: "018f4e1a-00c0-7c3d-8e4f-5a6b7c8d9e0f",
        pickup: AddressSnapshot.of({ street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 121.0 }),
        dropoff: AddressSnapshot.of({ street: "2 Main", city: "Manila", country: "PH", lat: 14.7, lng: 121.1 }),
        items: [OrderItemLine.of({ description: "box", quantity: 2, weightKg: null })],
        scheduledFor: null,
      },
      now,
    );

    expect(a.items.map((i) => i.toJSON())).toEqual([{ description: "box", quantity: 2, weightKg: null }]);
  });
});
