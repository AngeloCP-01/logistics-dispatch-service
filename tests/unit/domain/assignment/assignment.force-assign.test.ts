import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { DriverId, OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { ForceAssignNotAllowedError } from "@/domain/shared/errors.js";
import { DriverAssigned } from "@/domain/events/index.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";
const a0 = () => Assignment.fromOrderCreated(
  { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1",
    pickup: AddressSnapshot.of({ street: "1", city: "M", country: "PH", lat: 1, lng: 1 }),
    dropoff: AddressSnapshot.of({ street: "2", city: "M", country: "PH", lat: 2, lng: 2 }),
    scheduledFor: null }, NOW);

describe("Assignment.forceAssign", () => {
  it("assigns from awaiting_driver and emits DriverAssigned", () => {
    const a = a0();
    a.forceAssign(DriverId.of(D2), NOW);
    expect(a.status).toBe(AssignmentStatus.ASSIGNED);
    expect(a.assignedDriverId).toBe(D2);
    expect(a.pullEvents()[0]).toBeInstanceOf(DriverAssigned);
  });
  it("assigns from failed", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.rejectByDriver(DriverId.of(D1), EXP);
    a.markFailed(EXP);
    a.pullEvents();
    a.forceAssign(DriverId.of(D2), NOW);
    expect(a.status).toBe(AssignmentStatus.ASSIGNED);
  });
  it("refuses to force-assign an already-assigned order", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    expect(() => a.forceAssign(DriverId.of(D2), NOW)).toThrow(ForceAssignNotAllowedError);
  });
});
