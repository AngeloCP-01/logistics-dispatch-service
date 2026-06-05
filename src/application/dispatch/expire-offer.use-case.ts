import { OrderId } from "../../domain/shared/ids.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { Clock } from "../ports/clock.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface ExpireInput { orderId: string; attemptNo: number; }

export class ExpireOfferUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly pool: DriverPool,
    private readonly dispatch: DispatchOrderUseCase,
    private readonly clock: Clock,
  ) {}
  async execute(input: ExpireInput, correlationId: string): Promise<void> {
    const orderId = OrderId.of(input.orderId);
    const a = await this.assignments.byId(orderId);
    if (!a) return;                                            // unknown order → no-op
    const driverId = a.currentAttempt()?.driverId ?? null;
    const expired = a.expireOffer(input.attemptNo, this.clock.now());
    if (!expired) return;                                      // stale/duplicate → no-op
    await this.assignments.save(a);
    if (driverId) await this.pool.freeDriver(driverId);
    await this.dispatch.failOrRetry(orderId, correlationId);
  }
}
