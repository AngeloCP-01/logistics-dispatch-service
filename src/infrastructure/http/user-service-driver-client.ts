import { z } from "zod";
import type { DriverDirectory, DriverInfo } from "../../application/ports/driver-directory.js";
import { DriverId } from "../../domain/shared/ids.js";
import type { ServiceJwtSigner } from "../auth/service-jwt-signer.js";
import { InfrastructureError } from "../../domain/shared/errors.js";

const driverSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  vehicleType: z.string().nullable().optional(),
  profileComplete: z.boolean().optional(),
});

export class UserServiceDriverClient implements DriverDirectory {
  constructor(private readonly baseUrl: string, private readonly signer: ServiceJwtSigner) {}
  async getDriver(driverId: DriverId): Promise<DriverInfo | null> {
    const token = this.signer.sign("user-service");
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/users/internal/drivers/${driverId}`, {
        headers: { "X-Service-Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch (cause) {
      throw new InfrastructureError(`user-service unreachable: ${String(cause)}`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new InfrastructureError(`user-service ${res.status}`);
    const body = driverSchema.parse(await res.json());
    return { driverId: DriverId.of(body.userId), displayName: body.displayName, vehicleType: body.vehicleType ?? null };
  }
}
