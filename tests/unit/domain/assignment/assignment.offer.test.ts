import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OfferOutcome } from "@/domain/assignment/offer-outcome.js";
import { DriverId, OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { InvariantViolationError } from "@/domain/shared/errors.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");
const D = (s: string) => DriverId.of(s);
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const a0 = () => Assignment.fromOrderCreated(
  { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1",
    pickup: AddressSnapshot.of({ street: "1", city: "M", country: "PH", lat: 1, lng: 1 }),
    dropoff: AddressSnapshot.of({ street: "2", city: "M", country: "PH", lat: 2, lng: 2 }),
    scheduledFor: null }, NOW);

describe("Assignment.offerTo", () => {
  it("records an offer, increments attempts, moves to offered", () => {
    const a = a0();
    a.offerTo("att-1", D(D1), NOW, EXP);
    expect(a.status).toBe(AssignmentStatus.OFFERED);
    expect(a.offerAttempts).toBe(1);
    const cur = a.currentAttempt()!;
    expect(cur.attemptNo).toBe(1);
    expect(cur.driverId).toBe(D1);
    expect(cur.outcome).toBe(OfferOutcome.OFFERED);
    expect(cur.expiresAt).toEqual(EXP);
  });

  it("refuses to offer when not awaiting_driver", () => {
    const a = a0();
    a.offerTo("att-1", D(D1), NOW, EXP);
    expect(() => a.offerTo("att-2", D(D1), NOW, EXP)).toThrow(InvariantViolationError);
  });
});
