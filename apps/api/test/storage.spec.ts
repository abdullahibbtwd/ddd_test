import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { INestApplicationContext } from "@nestjs/common";
import { AppConfigModule } from "../src/config/config.module";
import { loadEnvFiles } from "../src/config/load-env";
import { buildKey } from "../src/storage/build-key";
import { StorageModule } from "../src/storage/storage.module";
import { StorageService } from "../src/storage/storage.service";

describe("storage", () => {
  let app: INestApplicationContext;
  let storage: StorageService;
  const key = `test/${randomUUID()}.txt`;

  beforeAll(async () => {
    loadEnvFiles();
    process.env.NODE_ENV = "test";
    app = await Test.createTestingModule({
      imports: [AppConfigModule, StorageModule],
    }).compile();
    await app.init();
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await storage.delete(key).catch(() => undefined);
    await app?.close();
  });

  it("puts, gets, exists, presigns, deletes", async () => {
    const body = Buffer.from(`hello-storage-${randomUUID()}`, "utf8");
    await storage.put(key, body, "text/plain");
    expect(await storage.exists(key)).toBe(true);

    const got = await storage.getBuffer(key);
    expect(got.equals(body)).toBe(true);

    const url = await storage.presignGet(key, 60);
    const response = await fetch(url);
    expect(response.ok).toBe(true);
    expect(Buffer.from(await response.arrayBuffer()).equals(body)).toBe(true);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("buildKey follows domain/yyyy/mm/uuid.ext in Europe/Sofia", () => {
    const fixed = new Date("2026-11-19T22:30:00.000Z"); // 2026-11-20 in Sofia (UTC+2)
    const built = buildKey("invoices", "pdf", fixed);
    expect(built).toMatch(
      /^invoices\/2026\/11\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i,
    );
  });
});
