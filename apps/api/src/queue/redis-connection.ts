import { URL } from "node:url";

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
};

export function redisConnectionFromUrl(redisUrl: string): RedisConnectionOptions {
  const parsed = new URL(redisUrl);
  const dbPath = parsed.pathname.replace(/^\//, "");
  const db = dbPath.length > 0 ? Number(dbPath) : undefined;

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    // Required by BullMQ workers.
    maxRetriesPerRequest: null,
  };
}
