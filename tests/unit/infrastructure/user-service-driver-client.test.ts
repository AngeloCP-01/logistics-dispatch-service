import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { UserServiceDriverClient } from "@/infrastructure/http/user-service-driver-client.js";
import { ServiceJwtSigner } from "@/infrastructure/auth/service-jwt-signer.js";
import { DriverId } from "@/domain/shared/ids.js";
import { InfrastructureError } from "@/domain/shared/errors.js";

const BASE_URL = "http://user-service.local";
const DRIVER_ID = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";

function client(): UserServiceDriverClient {
  const signer = new ServiceJwtSigner("a".repeat(32), "dispatch-service");
  return new UserServiceDriverClient(BASE_URL, signer);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("UserServiceDriverClient.getDriver", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps a 200 response into a DriverInfo", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { userId: DRIVER_ID, displayName: "Jane Driver", vehicleType: "car", profileComplete: true }),
    );
    global.fetch = fetchMock;

    const result = await client().getDriver(DriverId.of(DRIVER_ID));

    expect(result).toEqual({ driverId: DRIVER_ID, displayName: "Jane Driver", vehicleType: "car" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/v1/users/internal/drivers/${DRIVER_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Service-Authorization": expect.stringMatching(/^Bearer /) }),
      }),
    );
  });

  it("returns null on a 404", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(404, { type: "not_found" }));

    const result = await client().getDriver(DriverId.of(DRIVER_ID));

    expect(result).toBeNull();
  });

  it("throws InfrastructureError on a 500", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(500, { type: "internal" }));

    await expect(client().getDriver(DriverId.of(DRIVER_ID))).rejects.toThrow(InfrastructureError);
  });
});
