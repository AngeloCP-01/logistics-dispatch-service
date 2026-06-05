import type { DriverId } from "../../domain/shared/ids.js";

export interface DriverInfo {
  driverId: DriverId;
  displayName: string;
  vehicleType: string | null;
}
export interface DriverDirectory {
  /** Returns null when the id is not a current, profile-complete driver. */
  getDriver(driverId: DriverId): Promise<DriverInfo | null>;
}
