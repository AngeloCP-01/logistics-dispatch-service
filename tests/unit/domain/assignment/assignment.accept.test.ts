import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { DriverId, OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { NoActiveOfferError, NotOfferedDriverError } from "@/domain/shared/errors.js";
import { DriverAssigned } from "@/domain/events/index.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";
const a0 = () => Assignment.fromOrderCreated(
  { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1",
    pickup: AddressSnapshot.of({ street: "1", city: "M", country: "PH", lat: 1, lng: 1 }),
    dropoff: AddressSnapshot.of({ street: "2", city: "M", country: "PH", lat: 2, lng: 2 }),
    items: [], scheduledFor: null }, NOW);

describe("Assignment.accept", () => {
  it("assigns to the offered driver and emits DriverAssigned", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    expect(a.status).toBe(AssignmentStatus.ASSIGNED);
    expect(a.assignedDriverId).toBe(D1);
    const events = a.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(DriverAssigned);
  });

  it("rejects accept by a driver who was not offered", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    expect(() => a.accept(DriverId.of(D2), EXP)).toThrow(NotOfferedDriverError);
  });

  it("rejects accept when there is no active offer", () => {
    const a = a0();
    expect(() => a.accept(DriverId.of(D1), EXP)).toThrow(NoActiveOfferError);
  });
});
