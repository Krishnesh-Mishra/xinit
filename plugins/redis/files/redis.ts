import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/** Shared ioredis client. Connects eagerly when this module is imported. */
export const redis = new Redis(REDIS_URL);

redis.on("connect", () => {
  console.log("Redis connected");
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

export default redis;
