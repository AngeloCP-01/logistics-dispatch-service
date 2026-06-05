import type { RedisClient } from "./redis-client.js";
import type { DriverPool, AvailableDriver } from "../../application/ports/driver-pool.js";
import type { DriverId } from "../../domain/shared/ids.js";

const WILLING = "dispatch:drivers:willing";
const AVAILABLE = "dispatch:drivers:available";
const BUSY = "dispatch:drivers:busy";

// Atomically take the longest-waiting (lowest score) member of AVAILABLE not in ARGV,
// move it to BUSY, and return it. KEYS[1]=AVAILABLE, KEYS[2]=BUSY, ARGV=excluded ids.
const CLAIM_NEXT = `
local members = redis.call('ZRANGE', KEYS[1], 0, -1)
local excluded = {}
for i = 1, #ARGV do excluded[ARGV[i]] = true end
for _, m in ipairs(members) do
  if not excluded[m] then
    redis.call('ZREM', KEYS[1], m)
    redis.call('SADD', KEYS[2], m)
    return m
  end
end
return false`;

// SADD willing; ZADD available only if NOT busy. KEYS=[willing,busy,available], ARGV=[id, score].
const ON_WILLING = `
redis.call('SADD', KEYS[1], ARGV[1])
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 0 then
  redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
end
return 1`;

// SREM busy; ZADD available only if STILL willing. KEYS=[busy,willing,available], ARGV=[id, score].
const FREE_DRIVER = `
redis.call('SREM', KEYS[1], ARGV[1])
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  redis.call('ZADD', KEYS[3], ARGV[2], ARGV[1])
end
return 1`;

export class RedisDriverPool implements DriverPool {
  constructor(private readonly redis: RedisClient) {}

  async claimNext(excluded: DriverId[]): Promise<DriverId | null> {
    const res = (await this.redis.eval(CLAIM_NEXT, 2, AVAILABLE, BUSY, ...(excluded as string[]))) as string | null;
    return res ? (res as DriverId) : null;
  }
  async onWilling(driverId: DriverId, sinceMs: number): Promise<void> {
    await this.redis.eval(ON_WILLING, 3, WILLING, BUSY, AVAILABLE, driverId, String(sinceMs));
  }
  async onUnwilling(driverId: DriverId): Promise<void> {
    await this.redis.multi().srem(WILLING, driverId).zrem(AVAILABLE, driverId).exec();
  }
  async freeDriver(driverId: DriverId): Promise<void> {
    await this.redis.eval(FREE_DRIVER, 3, BUSY, WILLING, AVAILABLE, driverId, String(Date.now()));
  }
  async markBusy(driverId: DriverId): Promise<void> {
    await this.redis.multi().zrem(AVAILABLE, driverId).sadd(BUSY, driverId).exec();
  }
  async listAvailable(): Promise<AvailableDriver[]> {
    const flat = await this.redis.zrange(AVAILABLE, 0, -1, "WITHSCORES");
    const out: AvailableDriver[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push({ driverId: flat[i] as DriverId, availableSince: new Date(Number(flat[i + 1])) });
    return out;
  }
}
