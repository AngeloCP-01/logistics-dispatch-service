import request from "supertest";
import { v7 as uuidV7 } from "uuid";
import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";
import { waitFor } from "./helpers/wait-for.js";
import { availabilityChanged, orderCreated, deliveryCompleted } from "./helpers/events.js";

let fx: DispatchFixture;

beforeAll(async () => { fx = await bootstrap(); }, 120000);
afterAll(async () => { await fx.stop(); });
beforeEach(async () => { await fx.resetAll(); });

const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";

async function getAssignment(orderId: string): Promise<Record<string, unknown>> {
  const res = await request(fx.baseUrl)
    .get(`/v1/dispatch/assignments/${orderId}`)
    .set("Authorization", `Bearer ${fx.signUserJwt(uuidV7(), "admin")}`);
  return res.body as Record<string, unknown>;
}
const getStatus = async (orderId: string): Promise<unknown> => (await getAssignment(orderId)).status;

const assignmentCount = (orderId: string): Promise<number> =>
  fx.pg.prisma.assignment.count({ where: { orderId } });
const processedCount = (eventId: string): Promise<number> =>
  fx.pg.prisma.processedEvent.count({ where: { eventId } });

describe("consumer behavior", () => {
  it("parks an order with an empty pool, then offers it when a driver becomes willing", async () => {
    const orderId = uuidV7();
    await fx.publishEvent("order.created", orderCreated(orderId, uuidV7()));
    await waitFor(async () => (await getStatus(orderId)) === "awaiting_driver", 4000);

    await fx.publishEvent("driver.availability.changed", availabilityChanged(D1, true));
    await waitFor(async () => (await getStatus(orderId)) === "offered", 5000);
    const a = await getAssignment(orderId);
    expect((a.attempts as Array<{ driverId: string }>)[0].driverId).toBe(D1);
  });

  it("processes the same order.created (same eventId) only once", async () => {
    const orderId = uuidV7();
    const env = orderCreated(orderId, uuidV7()) as { eventId: string };
    await fx.publishEvent("order.created", env);
    await waitFor(async () => (await assignmentCount(orderId)) === 1, 4000);
    // Republish the identical envelope (same eventId).
    await fx.publishEvent("order.created", env);
    // Give the consumer time to process (and dedupe) the duplicate.
    await new Promise((r) => setTimeout(r, 1500));

    expect(await assignmentCount(orderId)).toBe(1);
    expect(await processedCount(env.eventId)).toBe(1);
    const a = await getAssignment(orderId);
    expect((a.attempts as unknown[]).length).toBe(0); // empty pool → parked, no offer
    expect(a.status).toBe("awaiting_driver");
  });

  it("records an out-of-order delivery.completed for an unseen order without crashing", async () => {
    const orderId = uuidV7();
    const env = deliveryCompleted(orderId) as { eventId: string };
    await fx.publishEvent("delivery.completed", env);
    await waitFor(async () => (await processedCount(env.eventId)) === 1, 4000);

    expect(await assignmentCount(orderId)).toBe(0); // no assignment created
    // consumer is still alive: a subsequent order.created still processes
    const liveOrder = uuidV7();
    await fx.publishEvent("order.created", orderCreated(liveOrder, uuidV7()));
    await waitFor(async () => (await assignmentCount(liveOrder)) === 1, 4000);
  });

  it("frees the driver back into the pool on delivery.completed", async () => {
    const orderId = uuidV7();
    await fx.publishEvent("driver.availability.changed", availabilityChanged(D1, true));
    await waitFor(async () => (await fx.pool.listAvailable()).some((d) => d.driverId === D1), 4000);
    await fx.publishEvent("order.created", orderCreated(orderId, uuidV7()));
    await waitFor(async () => (await getStatus(orderId)) === "offered", 5000);

    await request(fx.baseUrl)
      .post(`/v1/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D1, "driver")}`)
      .send({})
      .expect(204);
    expect(await getStatus(orderId)).toBe("assigned");
    expect((await fx.pool.listAvailable()).some((d) => d.driverId === D1)).toBe(false); // busy

    await fx.publishEvent("delivery.completed", deliveryCompleted(orderId));
    await waitFor(async () => (await fx.pool.listAvailable()).some((d) => d.driverId === D1), 4000);
  });
});
