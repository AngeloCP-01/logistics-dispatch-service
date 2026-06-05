import { OrderId, DriverId } from "../../domain/shared/ids.js";
import { AssignmentNotFoundError } from "../../domain/shared/errors.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { EventPublisher } from "../ports/event-publisher.js";
import type { Clock } from "../ports/clock.js";

export interface AcceptInput { orderId: string; driverId: string; }

export class AcceptOfferUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}
  async execute(input: AcceptInput, correlationId: string): Promise<void> {
    const orderId = OrderId.of(input.orderId);
    const a = await this.assignments.byId(orderId);
    if (!a) throw new AssignmentNotFoundError(input.orderId);
    a.accept(DriverId.of(input.driverId), this.clock.now());   // throws NoActiveOffer/NotOfferedDriver
    await this.assignments.save(a);
    await this.events.publishAll(a.pullEvents(), correlationId);
  }
}
