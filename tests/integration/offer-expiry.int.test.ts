import request from "supertest";
import { v7 as uuidV7 } from "uuid";
import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";
import { waitFor } from "./helpers/wait-for.js";
import { availabilityChanged, orderCreated } from "./helpers/events.js";

let fx: DispatchFixture;

beforeAll(async () => { fx = await bootstrap({ offerTtlSeconds: 1 }); }, 120000);
afterAll(async () => { await fx.stop(); });
beforeEach(async () => { await fx.resetAll(); });

const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";

async function getAssignment(orderId: string): Promise<Record<string, unknown>> {
  const res = await request(fx.baseUrl)
    .get(`/dispatch/assignments/${orderId}`)
    .set("Authorization", `Bearer ${fx.signUserJwt(uuidV7(), "admin")}`);
  return res.body as Record<string, unknown>;
}
const getStatus = async (orderId: string): Promise<unknown> => (await getAssignment(orderId)).status;

describe("offer expiry via the real TTL+DLX holding queue", () => {
  it("expires an unaccepted offer through the holding queue and re-parks the order", async () => {
    const orderId = uuidV7();

    await fx.publishEvent("driver.availability.changed", availabilityChanged(D1, true));
    await waitFor(async () => (await fx.pool.listAvailable()).some((d) => d.driverId === D1), 4000);

    await fx.publishEvent("order.created", orderCreated(orderId, uuidV7()));
    await waitFor(async () => (await getStatus(orderId)) === "offered", 4000);

    // Do NOT accept. The 1s per-message TTL fires → the holding queue dead-letters
    // the offer back to logistics.events (dispatch.offer.expired) → ExpireOfferUseCase
    // re-parks the order. Allow generous time for the broker round-trip.
    await waitFor(async () => (await getStatus(orderId)) === "awaiting_driver", 6000);

    const a = await getAssignment(orderId);
    expect(a.offerAttempts).toBe(1);
    expect((a.attempts as Array<{ outcome: string }>)[0].outcome).toBe("expired");
  });
});
