import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OfferOutcome } from "@/domain/assignment/offer-outcome.js";
import { DriverId, OrderId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { NoActiveOfferError } from "@/domain/shared/errors.js";

const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");
const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const a0 = () => Assignment.fromOrderCreated(
  { orderId: OrderId.of("018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f"), customerId: "c1",
    pickup: AddressSnapshot.of({ street: "1", city: "M", country: "PH", lat: 1, lng: 1 }),
    dropoff: AddressSnapshot.of({ street: "2", city: "M", country: "PH", lat: 2, lng: 2 }),
    items: [], scheduledFor: null }, NOW);

describe("Assignment.markCompleted", () => {
  it("completes an assigned order and returns true", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    expect(a.markCompleted(EXP)).toBe(true);
    expect(a.status).toBe(AssignmentStatus.COMPLETED);
  });
  it("is a no-op (false) when not assigned — terminal/out-of-order absorption", () => {
    const a = a0();
    expect(a.markCompleted(EXP)).toBe(false);
    expect(a.status).toBe(AssignmentStatus.AWAITING_DRIVER);
  });
});

describe("Assignment.cancel", () => {
  it("cancels an assigned order and reports the freed driver", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    expect(a.cancel(EXP)).toEqual({ freedDriverId: D1 });
    expect(a.status).toBe(AssignmentStatus.CANCELLED);
  });
  it("cancels an offered order and frees the offered driver", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    expect(a.cancel(EXP)).toEqual({ freedDriverId: D1 });
    expect(a.status).toBe(AssignmentStatus.CANCELLED);
  });
  it("cancel of an awaiting_driver order frees nobody", () => {
    const a = a0();
    expect(a.cancel(EXP)).toEqual({ freedDriverId: null });
  });
  it("marks the offered attempt expired so a late accept is rejected", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.cancel(EXP);
    expect(a.currentAttempt()!.outcome).toBe(OfferOutcome.EXPIRED);
    expect(() => a.accept(DriverId.of(D1), EXP)).toThrow(NoActiveOfferError);
  });
  it("cancel of a terminal order is a no-op", () => {
    const a = a0();
    a.offerTo("att-1", DriverId.of(D1), NOW, EXP);
    a.accept(DriverId.of(D1), EXP);
    a.markCompleted(EXP);
    expect(a.cancel(EXP)).toEqual({ freedDriverId: null });
    expect(a.status).toBe(AssignmentStatus.COMPLETED);
  });
});
