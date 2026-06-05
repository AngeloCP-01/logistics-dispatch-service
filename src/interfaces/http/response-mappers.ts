import type { Assignment } from "../../domain/assignment/assignment.js";

export function toAssignmentResponse(a: Assignment) {
  return {
    orderId: a.orderId,
    status: a.status,
    assignedDriverId: a.assignedDriverId,
    offerAttempts: a.offerAttempts,
    attempts: a.attempts.map((t) => ({
      driverId: t.driverId,
      attemptNo: t.attemptNo,
      outcome: t.outcome,
      offeredAt: t.offeredAt.toISOString(),
      respondedAt: t.respondedAt ? t.respondedAt.toISOString() : null,
    })),
  };
}
