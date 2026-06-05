import type { OrderId } from "../shared/ids.js";

export type AssignmentFailureReason = "all_offers_rejected";

export class AssignmentFailed {
  readonly eventType = "dispatch.assignment.failed" as const;
  constructor(
    readonly orderId: OrderId,
    readonly reason: AssignmentFailureReason,
    readonly occurredAt: Date,
  ) {}
}
