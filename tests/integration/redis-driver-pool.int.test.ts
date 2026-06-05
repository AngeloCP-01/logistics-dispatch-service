import { bootstrap, type DispatchFixture } from "./helpers/bootstrap.js";
import { DriverId } from "../../src/domain/shared/ids.js";

const D = (n: number) => DriverId.of(`018f4e1a-00${n.toString().padStart(2, "0")}-7c3d-8e4f-5a6b7c8d9e0f`);
let fx: DispatchFixture;
beforeAll(async () => { fx = await bootstrap({ startConsumer: false }); }, 120000);
afterAll(async () => { await fx.stop(); });
beforeEach(async () => { await fx.resetAll(); });

describe("RedisDriverPool", () => {
  it("claims in FIFO order and skips excluded drivers", async () => {
    await fx.pool.onWilling(D(1), 1000);
    await fx.pool.onWilling(D(2), 2000);
    const first = await fx.pool.claimNext([D(1)]);   // exclude the longest-waiting
    expect(first).toBe(D(2));
  });

  it("never hands the same driver to two concurrent claims", async () => {
    await fx.pool.onWilling(D(1), 1000);
    const [a, b] = await Promise.all([fx.pool.claimNext([]), fx.pool.claimNext([])]);
    expect([a, b].filter((x) => x === D(1))).toHaveLength(1);   // exactly one winner
    expect([a, b].filter((x) => x === null)).toHaveLength(1);
  });

  it("does not re-add a busy driver who becomes willing again", async () => {
    await fx.pool.onWilling(D(1), 1000);
    await fx.pool.claimNext([]);                      // now busy
    await fx.pool.onWilling(D(1), 5000);             // willing event during the job
    expect(await fx.pool.listAvailable()).toHaveLength(0);
    await fx.pool.freeDriver(D(1));                   // job ends → re-enters (still willing)
    expect(await fx.pool.listAvailable()).toHaveLength(1);
  });
});
