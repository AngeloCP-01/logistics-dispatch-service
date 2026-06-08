import request from "supertest";
import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";

describe("readyz (integration)", () => {
  let fx: DispatchFixture;
  beforeAll(async () => { fx = await bootstrap({ startConsumer: false }); }, 120000);
  afterAll(async () => { if (fx) await fx.stop(); });

  it("returns 200 on /readyz when DB + channel + Redis are healthy", async () => {
    const res = await request(fx.baseUrl).get("/readyz");
    expect(res.status).toBe(200);
  });

  it("returns 200 on /healthz", async () => {
    const res = await request(fx.baseUrl).get("/healthz");
    expect(res.status).toBe(200);
  });

  // Stopping a container permanently breaks the shared fixture and setShuttingDown
  // can't be undone, so these failure cases run last and in this order: Redis-down
  // (DB + channel still up), then Postgres-down, then shutting-down.
  it("returns 503 when Redis is stopped", async () => {
    await fx.redisContainer.stop();
    const res = await request(fx.baseUrl).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
  }, 30000);

  it("returns 503 when Postgres is stopped", async () => {
    await fx.pg.container.stop();
    const res = await request(fx.baseUrl).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
  }, 30000);

  it("returns 503 while shutting down", async () => {
    fx.setShuttingDown();
    const res = await request(fx.baseUrl).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
  });
});
