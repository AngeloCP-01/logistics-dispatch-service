import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import { AssignmentStatus } from "../../domain/assignment/assignment-status.js";
import type { OrderId } from "../../domain/shared/ids.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { OfferScheduler } from "../ports/offer-scheduler.js";
import type { EventPublisher } from "../ports/event-publisher.js";
import type { Clock } from "../ports/clock.js";

export class DispatchOrderUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly pool: DriverPool,
    private readonly scheduler: OfferScheduler,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
    private readonly newAttemptId: () => string,
    private readonly maxAttempts: number,
    private readonly ttlSeconds: number,
  ) {}

  /** Offer the order to the next eligible driver, or park it. Never fails (empty pool just parks). */
  async attempt(orderId: OrderId, _correlationId: string): Promise<void> {
    const a = await this.assignments.byId(orderId);
    if (!a || a.status !== AssignmentStatus.AWAITING_DRIVER) return;
    const driverId = await this.pool.claimNext(a.triedDriverIds());
    if (!driverId) return;                                   // park
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    a.offerTo(this.newAttemptId(), driverId, now, expiresAt);
    await this.assignments.save(a);
    await this.scheduler.scheduleExpiry(orderId, a.currentAttempt()!.attemptNo, this.ttlSeconds);
  }

  /** Called after an offer is declined/expired: fail if exhausted, else try the next driver. */
  async failOrRetry(orderId: OrderId, correlationId: string): Promise<void> {
    const a = await this.assignments.byId(orderId);
    if (!a || a.status !== AssignmentStatus.AWAITING_DRIVER) return;
    if (a.offerAttempts >= this.maxAttempts) {
      a.markFailed(this.clock.now());
      await this.assignments.save(a);
      await this.events.publishAll(a.pullEvents(), correlationId);
    } else {
      await this.attempt(orderId, correlationId);
    }
  }

  /** Re-dispatch parked orders oldest-first (called after any driver becomes assignable). */
  async retryParked(correlationId: string): Promise<void> {
    const parked = await this.assignments.awaitingDriverOldestFirst(50);
    for (const a of parked) await this.attempt(a.orderId, correlationId);
  }
}
