import type { DriverPool } from "../ports/driver-pool.js";
import type { DriverDirectory } from "../ports/driver-directory.js";

export interface AvailableDriverView {
  driverId: string; displayName: string; vehicleType: string | null; availableSince: string;
}

export class ListAvailableDriversUseCase {
  constructor(private readonly pool: DriverPool, private readonly directory: DriverDirectory) {}
  async execute(): Promise<AvailableDriverView[]> {
    const available = await this.pool.listAvailable();
    const views: AvailableDriverView[] = [];
    for (const d of available) {
      const info = await this.directory.getDriver(d.driverId);
      views.push({
        driverId: d.driverId,
        displayName: info?.displayName ?? d.driverId,
        vehicleType: info?.vehicleType ?? null,
        availableSince: d.availableSince.toISOString(),
      });
    }
    return views;
  }
}
