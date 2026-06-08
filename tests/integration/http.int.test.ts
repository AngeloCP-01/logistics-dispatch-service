import request from "supertest";
import { v7 as uuidV7 } from "uuid";
import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";
import { waitFor } from "./helpers/wait-for.js";
import { availabilityChanged, orderCreated } from "./helpers/events.js";

let fx: DispatchFixture;

beforeAll(async () => { fx = await bootstrap(); }, 120000);
afterAll(async () => { await fx.stop(); });
beforeEach(async () => { await fx.resetAll(); });

const D1 = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";
const D2 = "018f4e1a-0002-7c3d-8e4f-5a6b7c8d9e0f";

const adminJwt = () => fx.signUserJwt(uuidV7(), "admin");

async function getStatus(orderId: string): Promise<unknown> {
  const res = await request(fx.baseUrl)
    .get(`/dispatch/assignments/${orderId}`)
    .set("Authorization", `Bearer ${adminJwt()}`);
  return res.body.status;
}

/** Drives an order to an `offered` state held by D1. */
async function offerToD1(orderId: string): Promise<void> {
  await fx.publishEvent("driver.availability.changed", availabilityChanged(D1, true));
  await waitFor(async () => (await fx.pool.listAvailable()).some((d) => d.driverId === D1), 4000);
  await fx.publishEvent("order.created", orderCreated(orderId, uuidV7()));
  await waitFor(async () => (await getStatus(orderId)) === "offered", 5000);
}

/** Creates a parked (awaiting_driver) order with an empty pool. */
async function parkOrder(orderId: string): Promise<void> {
  await fx.publishEvent("order.created", orderCreated(orderId, uuidV7()));
  await waitFor(async () => (await getStatus(orderId)) === "awaiting_driver", 4000);
}

describe("HTTP authz", () => {
  it("rejects accept by a driver who is not the offered driver (403)", async () => {
    const orderId = uuidV7();
    await offerToD1(orderId);
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D2, "driver")}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects accept when the order is not offered (409)", async () => {
    const orderId = uuidV7();
    await offerToD1(orderId);
    // D1 accepts → assigned
    await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D1, "driver")}`)
      .send({})
      .expect(204);
    // accepting again is a conflict (no active offer)
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D1, "driver")}`)
      .send({});
    expect(res.status).toBe(409);
  });

  it("rejects accept with a customer-role JWT (403, role guard)", async () => {
    const orderId = uuidV7();
    await offerToD1(orderId);
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/accept`)
      .set("Authorization", `Bearer ${fx.signUserJwt(uuidV7(), "customer")}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects force-assign by a non-admin (403)", async () => {
    const orderId = uuidV7();
    await parkOrder(orderId);
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/force-assign`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D1, "driver")}`)
      .send({ driverId: D1 });
    expect(res.status).toBe(403);
  });

  it("returns 422 when an admin force-assigns an unknown driver", async () => {
    const orderId = uuidV7();
    await parkOrder(orderId);
    // driverStub is empty → directory returns 404 → DriverNotAssignableError (422)
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/force-assign`)
      .set("Authorization", `Bearer ${adminJwt()}`)
      .send({ driverId: D1 });
    expect(res.status).toBe(422);
  });

  it("force-assigns a valid driver on a parked order (204 → assigned)", async () => {
    const orderId = uuidV7();
    await parkOrder(orderId);
    fx.driverStub.set(D1, { userId: D1, displayName: "Driver One", vehicleType: "car" });
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/force-assign`)
      .set("Authorization", `Bearer ${adminJwt()}`)
      .send({ driverId: D1 });
    expect(res.status).toBe(204);
    expect(await getStatus(orderId)).toBe("assigned");
  });

  it("returns 409 when force-assigning an already-assigned order", async () => {
    const orderId = uuidV7();
    await parkOrder(orderId);
    fx.driverStub.set(D1, { userId: D1, displayName: "Driver One", vehicleType: "car" });
    await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/force-assign`)
      .set("Authorization", `Bearer ${adminJwt()}`)
      .send({ driverId: D1 })
      .expect(204);
    fx.driverStub.set(D2, { userId: D2, displayName: "Driver Two", vehicleType: "bike" });
    const res = await request(fx.baseUrl)
      .post(`/dispatch/assignments/${orderId}/force-assign`)
      .set("Authorization", `Bearer ${adminJwt()}`)
      .send({ driverId: D2 });
    expect(res.status).toBe(409);
  });

  it("rejects GET assignment by an unrelated driver (403)", async () => {
    const orderId = uuidV7();
    await offerToD1(orderId);
    const res = await request(fx.baseUrl)
      .get(`/dispatch/assignments/${orderId}`)
      .set("Authorization", `Bearer ${fx.signUserJwt(D2, "driver")}`);
    expect(res.status).toBe(403);
  });

  it("allows GET assignment by an admin (200)", async () => {
    const orderId = uuidV7();
    await offerToD1(orderId);
    const res = await request(fx.baseUrl)
      .get(`/dispatch/assignments/${orderId}`)
      .set("Authorization", `Bearer ${adminJwt()}`);
    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe(orderId);
  });
});
