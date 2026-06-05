import type { DriverId } from "../../domain/shared/ids.js";

export interface AvailableDriver {
  driverId: DriverId;
  availableSince: Date;
}

export interface DriverPool {
  /** Atomically take the longest-waiting willing+free driver not in `excluded`, mark them busy. */
  claimNext(excluded: DriverId[]): Promise<DriverId | null>;
  /** isAvailable=true: become willing; enter the queue iff not busy. `sinceMs` is the FIFO score. */
  onWilling(driverId: DriverId, sinceMs: number): Promise<void>;
  /** isAvailable=false: leave willing + the queue. */
  onUnwilling(driverId: DriverId): Promise<void>;
  /** A delivery ended (or an offer was declined): leave busy, re-enter the queue iff still willing. */
  freeDriver(driverId: DriverId): Promise<void>;
  /** Force a driver busy (admin force-assign): leave the queue, enter busy. */
  markBusy(driverId: DriverId): Promise<void>;
  listAvailable(): Promise<AvailableDriver[]>;
}
