import Redis, { type RedisOptions } from "ioredis";
export type RedisClient = Redis;
export function createRedisClient(url: string, options: RedisOptions = {}): RedisClient {
  return new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 3000, ...options });
}
