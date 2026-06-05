import type { OrderId, DriverId } from "../shared/ids.js";
import type { AddressSnapshot } from "../shared/address-snapshot.js";
import { AssignmentStatus } from "./assignment-status.js";
import { OfferOutcome } from "./offer-outcome.js";
import type { DomainEvent } from "../events/index.js";
import { InvariantViolationError, NoActiveOfferError, NotOfferedDriverError } from "../shared/errors.js";
import { DriverAssigned } from "../events/index.js";

export interface OfferAttempt {
  id: string;
  driverId: DriverId;
  attemptNo: number;
  outcome: OfferOutcome;
  offeredAt: Date;
  respondedAt: Date | null;
  expiresAt: Date;
}

export interface AssignmentProps {
  orderId: OrderId;
  customerId: string;
  pickup: AddressSnapshot;
  dropoff: AddressSnapshot;
  scheduledFor: Date | null;
  status: AssignmentStatus;
  assignedDriverId: DriverId | null;
  offerAttempts: number;
  attempts: OfferAttempt[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderCreatedInput {
  orderId: OrderId;
  customerId: string;
  pickup: AddressSnapshot;
  dropoff: AddressSnapshot;
  scheduledFor: Date | null;
}

export class Assignment {
  private readonly events: DomainEvent[] = [];
  private constructor(private props: AssignmentProps) {}

  static fromOrderCreated(input: OrderCreatedInput, now: Date): Assignment {
    return new Assignment({
      orderId: input.orderId,
      customerId: input.customerId,
      pickup: input.pickup,
      dropoff: input.dropoff,
      scheduledFor: input.scheduledFor,
      status: AssignmentStatus.AWAITING_DRIVER,
      assignedDriverId: null,
      offerAttempts: 0,
      attempts: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPersistence(props: AssignmentProps): Assignment {
    return new Assignment({ ...props, attempts: [...props.attempts] });
  }

  get orderId(): OrderId { return this.props.orderId; }
  get customerId(): string { return this.props.customerId; }
  get pickup(): AddressSnapshot { return this.props.pickup; }
  get dropoff(): AddressSnapshot { return this.props.dropoff; }
  get scheduledFor(): Date | null { return this.props.scheduledFor; }
  get status(): AssignmentStatus { return this.props.status; }
  get assignedDriverId(): DriverId | null { return this.props.assignedDriverId; }
  get offerAttempts(): number { return this.props.offerAttempts; }
  get attempts(): readonly OfferAttempt[] { return this.props.attempts; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  currentAttempt(): OfferAttempt | null {
    return this.props.attempts.length ? this.props.attempts[this.props.attempts.length - 1] : null;
  }

  triedDriverIds(): DriverId[] {
    return this.props.attempts
      .filter((a) => a.outcome === OfferOutcome.REJECTED || a.outcome === OfferOutcome.EXPIRED)
      .map((a) => a.driverId);
  }

  offerTo(attemptId: string, driverId: DriverId, now: Date, expiresAt: Date): void {
    if (this.props.status !== AssignmentStatus.AWAITING_DRIVER) {
      throw new InvariantViolationError(`cannot offer in status ${this.props.status}`);
    }
    const attemptNo = this.props.offerAttempts + 1;
    this.props.attempts.push({
      id: attemptId, driverId, attemptNo,
      outcome: OfferOutcome.OFFERED, offeredAt: now, respondedAt: null, expiresAt,
    });
    this.props.offerAttempts = attemptNo;
    this.props.status = AssignmentStatus.OFFERED;
    this.props.updatedAt = now;
  }

  accept(driverId: DriverId, now: Date): void {
    if (this.props.status !== AssignmentStatus.OFFERED) throw new NoActiveOfferError();
    const cur = this.currentAttempt();
    if (!cur || cur.driverId !== driverId) throw new NotOfferedDriverError();
    cur.outcome = OfferOutcome.ACCEPTED;
    cur.respondedAt = now;
    this.props.status = AssignmentStatus.ASSIGNED;
    this.props.assignedDriverId = driverId;
    this.props.updatedAt = now;
    this.events.push(new DriverAssigned(this.props.orderId, driverId, now));
  }

  pullEvents(): DomainEvent[] {
    return this.events.splice(0);
  }
}
