import type { Assignment } from "../../domain/assignment/assignment.js";

function toOrderSummary(a: Assignment) {
  return {
    pickup: a.pickup.toJSON(),
    dropoff: a.dropoff.toJSON(),
    items: a.items.map((i) => i.toJSON()),
  };
}

export function toAssignmentResponse(a: Assignment) {
  return {
    orderId: a.orderId,
    status: a.status,
    assignedDriverId: a.assignedDriverId,
    offerAttempts: a.offerAttempts,
    order: toOrderSummary(a),
    attempts: a.attempts.map((t) => ({
      driverId: t.driverId,
      attemptNo: t.attemptNo,
      outcome: t.outcome,
      offeredAt: t.offeredAt.toISOString(),
      respondedAt: t.respondedAt ? t.respondedAt.toISOString() : null,
    })),
  };
}

export function toCurrentOfferResponse(a: Assignment) {
  const current = a.currentAttempt();
  return {
    orderId: a.orderId,
    offerAttempts: a.offerAttempts,
    expiresAt: current ? current.expiresAt.toISOString() : null,
    order: toOrderSummary(a),
  };
}
