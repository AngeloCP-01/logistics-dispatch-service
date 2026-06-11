import request from "supertest";
import { v7 as uuidV7 } from "uuid";
import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";
import { waitFor } from "./helpers/wait-for.js";
import { availabilityChanged, orderCreated, collectEvents, type EventCollector } from "./helpers/events.js";

let fx: DispatchFixture;
let collector: EventCollector;

beforeAll(async () => {
  fx = await bootstrap();
  collector = await collectEvents(fx.rabbit.url, ["dispatch.driver.assigned"]);
}, 120000);
afterAll(async () => {
  await collector.stop();
  await fx.stop();
});
beforeEach(async () => {
  await fx.resetAll();
  collector.messages.length = 0;
});

const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";

async function getAssignment(orderId: string): Promise<Record<string, unknown>> {
  const res = await request(fx.baseUrl)
    .get(`/v1/dispatch/assignments/${orderId}`)
    .set("Authorization", `Bearer ${fx.signUserJwt(uuidV7(), "admin")}`);
  return res.body as Record<string, unknown>;
}

describe("assignment flow (order.created → offer → accept → assigned)", () => {
  it("offers a new order to a willing driver, who accepts, producing dispatch.driver.assigned", async () => {
    const orderId = uuidV7();
    const customerId = uuidV7();

    // 1. driver becomes willing
    await fx.publishEvent("driver.availability.changed", availabilityChanged(D1, true));
    await waitFor(async () => (await fx.pool.listAvailable()).some((d) => d.driverId === D1), 4000);

    // 2. order is created
    await fx.publishEvent("order.created", orderCreated(orderId, customerId));

    // 3. poll until the assignment is offered to D1
    await waitFor(async () => (await getAssignment(orderId)).status === "offered", 5000);
    const offered = await getAssignment(orderId);
    expect(offered.status).toBe("offered");
    expect((offered.attempts as Array<{ driverId: string }>)[0].driverId).toBe(D1);

    // 4. D1 accepts over HTTP
    const acceptRes = await request(fx.baseUrl)
      .post(`/v1/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D1, "driver")}`)
      .send({});
    expect(acceptRes.status).toBe(204);

    // 5. assignment is now assigned to D1
    const assigned = await getAssignment(orderId);
    expect(assigned.status).toBe("assigned");
    expect(assigned.assignedDriverId).toBe(D1);

    // 6. a dispatch.driver.assigned envelope was published
    await waitFor(
      async () => collector.messages.some((m) => m.routingKey === "dispatch.driver.assigned" && m.data.orderId === orderId),
      4000,
    );
    const published = collector.messages.find((m) => m.routingKey === "dispatch.driver.assigned" && m.data.orderId === orderId);
    expect(published).toBeDefined();
    expect(published!.data).toMatchObject({ orderId, driverId: D1 });
  });
});
