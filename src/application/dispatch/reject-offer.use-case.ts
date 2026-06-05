import { OrderId, DriverId } from "../../domain/shared/ids.js";
import { AssignmentNotFoundError } from "../../domain/shared/errors.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { Clock } from "../ports/clock.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface RejectInput { orderId: string; driverId: string; reason?: string; }

export class RejectOfferUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly pool: DriverPool,
    private readonly dispatch: DispatchOrderUseCase,
    private readonly clock: Clock,
  ) {}
  async execute(input: RejectInput, correlationId: string): Promise<void> {
    const orderId = OrderId.of(input.orderId);
    const driverId = DriverId.of(input.driverId);
    const a = await this.assignments.byId(orderId);
    if (!a) throw new AssignmentNotFoundError(input.orderId);
    a.rejectByDriver(driverId, this.clock.now());              // throws NoActiveOffer/NotOfferedDriver
    await this.assignments.save(a);
    await this.pool.freeDriver(driverId);
    await this.dispatch.failOrRetry(orderId, correlationId);
  }
}
