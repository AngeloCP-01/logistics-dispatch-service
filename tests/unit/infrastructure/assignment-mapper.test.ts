import type { Assignment as PrismaAssignment, AssignmentAttempt as PrismaAttempt } from "@prisma/client";
import { AssignmentMapper } from "@/infrastructure/persistence/assignment-mapper.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import { OfferOutcome } from "@/domain/assignment/offer-outcome.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";

const ORDER_ID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
const CUSTOMER_ID = "018f4e1a-2c2b-7c3d-8e4f-5a6b7c8d9e0f";
const DRIVER_ID = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const ATTEMPT_ID = "018f4e1a-aaaa-7c3d-8e4f-5a6b7c8d9e0f";
const NOW = new Date("2026-06-05T10:00:00.000Z");
const EXP = new Date("2026-06-05T10:00:30.000Z");

function domainWithOneOffer(): Assignment {
  const a = Assignment.fromOrderCreated(
    {
      orderId: OrderId.of(ORDER_ID),
      customerId: CUSTOMER_ID,
      pickup: AddressSnapshot.of({ label: "home", street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 120.98 }),
      dropoff: AddressSnapshot.of({ street: "2 Side", city: "Cebu", country: "PH", lat: 10.3, lng: 123.9 }),
      scheduledFor: null,
    },
    NOW,
  );
  a.offerTo(ATTEMPT_ID, DriverId.of(DRIVER_ID), NOW, EXP);
  return a;
}

/** Reassemble a Prisma Row from toPersistence output + the domain's attempts. */
function toRow(a: Assignment): PrismaAssignment & { attempts: PrismaAttempt[] } {
  const p = AssignmentMapper.toPersistence(a);
  const attempts: PrismaAttempt[] = a.attempts.map((at) => ({
    id: at.id,
    orderId: a.orderId,
    driverId: at.driverId,
    attemptNo: at.attemptNo,
    outcome: at.outcome,
    offeredAt: at.offeredAt,
    respondedAt: at.respondedAt,
    expiresAt: at.expiresAt,
  }));
  return {
    orderId: p.orderId,
    customerId: p.customerId,
    status: p.status,
    pickup: p.pickup,
    dropoff: p.dropoff,
    items: [],
    scheduledFor: p.scheduledFor,
    assignedDriverId: p.assignedDriverId,
    offerAttempts: p.offerAttempts,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    attempts,
  } as PrismaAssignment & { attempts: PrismaAttempt[] };
}

describe("AssignmentMapper round-trip", () => {
  it("preserves status, offerAttempts, and the offered attempt through toPersistence -> toDomain", () => {
    const original = domainWithOneOffer();

    const row = toRow(original);
    const back = AssignmentMapper.toDomain(row);

    expect(back.status).toBe(AssignmentStatus.OFFERED);
    expect(back.offerAttempts).toBe(1);
    expect(back.assignedDriverId).toBeNull();

    expect(back.attempts).toHaveLength(1);
    const at = back.attempts[0];
    expect(at.id).toBe(ATTEMPT_ID);
    expect(at.driverId).toBe(DRIVER_ID);
    expect(at.attemptNo).toBe(1);
    expect(at.outcome).toBe(OfferOutcome.OFFERED);
  });

  it("round-trips the pickup and dropoff address snapshots by value", () => {
    const original = domainWithOneOffer();

    const back = AssignmentMapper.toDomain(toRow(original));

    expect(back.pickup.toJSON()).toEqual(original.pickup.toJSON());
    expect(back.dropoff.toJSON()).toEqual(original.dropoff.toJSON());
  });
});
