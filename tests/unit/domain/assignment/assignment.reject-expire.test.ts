import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OfferOutcome } from "@/domain/assignment/offer-outcome.js";
import { DriverId, OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { NotOfferedDriverError } from "@/domain/shared/errors.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";
const a0 = () => Assignment.fromOrderCreated(
  { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1",
    pickup: AddressSnapshot.of({ street: "1", city: "M", country: "PH", lat: 1, lng: 1 }),
    dropoff: AddressSnapshot.of({ street: "2", city: "M", country: "PH", lat: 2, lng: 2 }),
    scheduledFor: null }, NOW);

describe("Assignment.rejectByDriver", () => {
  it("returns to awaiting_driver and records the rejection in the tried set", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.rejectByDriver(DriverId.of(D1), EXP);
    expect(a.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(a.offerAttempts).toBe(1);
    expect(a.triedDriverIds()).toEqual([D1]);
    expect(a.currentAttempt()!.outcome).toBe(OfferOutcome.REJECTED);
  });
  it("rejects a reject from a non-offered driver", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    expect(() => a.rejectByDriver(DriverId.of(D2), EXP)).toThrow(NotOfferedDriverError);
  });
});

describe("Assignment.expireOffer", () => {
  it("expires the current offer by attemptNo and returns true", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    expect(a.expireOffer(1, EXP)).toBe(true);
    expect(a.status).toBe(AssignmentStatus.AWAITING_DRIVER);
    expect(a.triedDriverIds()).toEqual([D1]);
  });
  it("is a no-op (returns false) when the attemptNo is stale", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    expect(a.expireOffer(1, EXP)).toBe(false);
    expect(a.status).toBe(AssignmentStatus.ASSIGNED);
  });
  it("is a no-op for a stale attemptNo after a re-offer interleaving", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.rejectByDriver(DriverId.of(D1), EXP);
    a.offerTo("att-2", DriverId.of(D2), NOW, EXP);

    expect(a.expireOffer(1, EXP)).toBe(false);
    expect(a.status).toBe(AssignmentStatus.OFFERED);
    expect(a.currentAttempt()!.attemptNo).toBe(2);
    expect(a.currentAttempt()!.outcome).toBe(OfferOutcome.OFFERED);
  });
});
