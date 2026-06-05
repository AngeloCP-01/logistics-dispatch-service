import type { Assignment as PrismaAssignment, AssignmentAttempt as PrismaAttempt, Prisma } from "@prisma/client";
import { Assignment, type OfferAttempt } from "../../domain/assignment/assignment.js";
import { OrderId, DriverId } from "../../domain/shared/ids.js";
import { AddressSnapshot } from "../../domain/shared/address-snapshot.js";
import type { AssignmentStatus } from "../../domain/assignment/assignment-status.js";
import type { OfferOutcome } from "../../domain/assignment/offer-outcome.js";

type Row = PrismaAssignment & { attempts: PrismaAttempt[] };

export const AssignmentMapper = {
  toDomain(row: Row): Assignment {
    const attempts: OfferAttempt[] = [...row.attempts]
      .sort((a, b) => a.attemptNo - b.attemptNo)
      .map((a) => ({
        id: a.id, driverId: DriverId.of(a.driverId), attemptNo: a.attemptNo,
        outcome: a.outcome as OfferOutcome, offeredAt: a.offeredAt, respondedAt: a.respondedAt, expiresAt: a.expiresAt,
      }));
    return Assignment.fromPersistence({
      orderId: OrderId.of(row.orderId),
      customerId: row.customerId,
      pickup: AddressSnapshot.of(row.pickup as Record<string, unknown> as never),
      dropoff: AddressSnapshot.of(row.dropoff as Record<string, unknown> as never),
      scheduledFor: row.scheduledFor,
      status: row.status as AssignmentStatus,
      assignedDriverId: row.assignedDriverId ? DriverId.of(row.assignedDriverId) : null,
      offerAttempts: row.offerAttempts,
      attempts,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
  toPersistence(a: Assignment) {
    return {
      orderId: a.orderId, customerId: a.customerId, status: a.status,
      pickup: a.pickup.toJSON() as Prisma.InputJsonValue, dropoff: a.dropoff.toJSON() as Prisma.InputJsonValue,
      scheduledFor: a.scheduledFor, assignedDriverId: a.assignedDriverId,
      offerAttempts: a.offerAttempts, createdAt: a.createdAt, updatedAt: a.updatedAt,
    };
  },
};
