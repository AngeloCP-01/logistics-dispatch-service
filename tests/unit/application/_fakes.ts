import type { Assignment } from "@/domain/assignment/assignment.js";
import { AssignmentStatus } from "@/domain/assignment/assignment-status.js";
import type { OrderId, DriverId } from "@/domain/shared/ids.js";
import type { AssignmentRepository } from "@/domain/assignment/assignment-repository.js";
import type { ProcessedEventRepository } from "@/application/ports/processed-event-repository.js";
import type { UnitOfWork, TransactionalRepos } from "@/application/ports/unit-of-work.js";
import type { EventPublisher } from "@/application/ports/event-publisher.js";
import type { DomainEvent } from "@/domain/events/index.js";
import type { Clock } from "@/application/ports/clock.js";
import type { DriverPool, AvailableDriver } from "@/application/ports/driver-pool.js";
import type { OfferScheduler } from "@/application/ports/offer-scheduler.js";
import type { DriverDirectory, DriverInfo } from "@/application/ports/driver-directory.js";

export class FakeAssignmentRepository implements AssignmentRepository {
  readonly store = new Map<string, Assignment>();
  async byId(orderId: OrderId): Promise<Assignment | null> { return this.store.get(orderId) ?? null; }
  async offeredForDriver(driverId: DriverId): Promise<Assignment | null> {
    for (const a of this.store.values()) {
      if (a.status === AssignmentStatus.OFFERED && a.currentAttempt()?.driverId === driverId) return a;
    }
    return null;
  }
  async save(a: Assignment): Promise<void> { this.store.set(a.orderId, a); }
  async awaitingDriverOldestFirst(limit: number): Promise<Assignment[]> {
    return [...this.store.values()]
      .filter((a) => a.status === AssignmentStatus.AWAITING_DRIVER)
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
      .slice(0, limit);
  }
}

export class FakeProcessedEventRepository implements ProcessedEventRepository {
  readonly seen = new Set<string>();
  async recordIfNew(eventId: string): Promise<boolean> {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId); return true;
  }
}

export class FakeUnitOfWork implements UnitOfWork {
  constructor(readonly assignments: FakeAssignmentRepository, readonly processedEvents: FakeProcessedEventRepository) {}
  async run<T>(work: (repos: TransactionalRepos) => Promise<T>): Promise<T> {
    return work({ assignments: this.assignments, processedEvents: this.processedEvents });
  }
}

export class FakeEventPublisher implements EventPublisher {
  readonly published: DomainEvent[] = [];
  async publishAll(events: DomainEvent[]): Promise<void> { this.published.push(...events); }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}
  now(): Date { return new Date(this.fixed.getTime()); }
}

/** In-memory pool honoring the willing/available/busy invariant for unit tests. */
export class FakeDriverPool implements DriverPool {
  readonly willing = new Set<string>();
  readonly busy = new Set<string>();
  readonly available = new Map<string, number>();  // driverId -> sinceMs
  readonly scheduledFreed: string[] = [];
  async claimNext(excluded: DriverId[]): Promise<DriverId | null> {
    const ex = new Set(excluded as string[]);
    const ordered = [...this.available.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const pick = ordered.find((id) => !ex.has(id));
    if (!pick) return null;
    this.available.delete(pick); this.busy.add(pick);
    return pick as DriverId;
  }
  async onWilling(driverId: DriverId, sinceMs: number): Promise<void> {
    this.willing.add(driverId);
    if (!this.busy.has(driverId)) this.available.set(driverId, sinceMs);
  }
  async onUnwilling(driverId: DriverId): Promise<void> {
    this.willing.delete(driverId); this.available.delete(driverId);
  }
  async freeDriver(driverId: DriverId): Promise<void> {
    this.busy.delete(driverId);
    if (this.willing.has(driverId)) this.available.set(driverId, Date.now());
    this.scheduledFreed.push(driverId);
  }
  async markBusy(driverId: DriverId): Promise<void> {
    this.available.delete(driverId); this.busy.add(driverId);
  }
  async listAvailable(): Promise<AvailableDriver[]> {
    return [...this.available.entries()].sort((a, b) => a[1] - b[1])
      .map(([id, ms]) => ({ driverId: id as DriverId, availableSince: new Date(ms) }));
  }
}

export class FakeOfferScheduler implements OfferScheduler {
  readonly scheduled: { orderId: string; attemptNo: number; ttlSeconds: number }[] = [];
  async scheduleExpiry(orderId: OrderId, attemptNo: number, ttlSeconds: number): Promise<void> {
    this.scheduled.push({ orderId, attemptNo, ttlSeconds });
  }
}

export class FakeDriverDirectory implements DriverDirectory {
  constructor(private readonly drivers: Map<string, DriverInfo>) {}
  async getDriver(driverId: DriverId): Promise<DriverInfo | null> { return this.drivers.get(driverId) ?? null; }
}
