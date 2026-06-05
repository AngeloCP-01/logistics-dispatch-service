import { OrderId, DriverId } from "../../domain/shared/ids.js";
import { AssignmentNotFoundError, DriverNotAssignableError } from "../../domain/shared/errors.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { DriverDirectory } from "../ports/driver-directory.js";
import type { EventPublisher } from "../ports/event-publisher.js";
import type { Clock } from "../ports/clock.js";

export interface ForceAssignInput { orderId: string; driverId: string; }

export class ForceAssignUseCase {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly pool: DriverPool,
    private readonly directory: DriverDirectory,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}
  async execute(input: ForceAssignInput, correlationId: string): Promise<void> {
    const driverId = DriverId.of(input.driverId);
    const driver = await this.directory.getDriver(driverId);
    if (!driver) throw new DriverNotAssignableError(input.driverId);
    const a = await this.assignments.byId(OrderId.of(input.orderId));
    if (!a) throw new AssignmentNotFoundError(input.orderId);
    a.forceAssign(driverId, this.clock.now());                // throws ForceAssignNotAllowedError
    await this.assignments.save(a);
    await this.pool.markBusy(driverId);
    await this.events.publishAll(a.pullEvents(), correlationId);
  }
}
