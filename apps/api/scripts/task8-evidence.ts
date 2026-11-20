/**
 * One-off Task 8 evidence: create-admin-style write, login, failed login,
 * password change, then dump audit rows + append-only rejection messages.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task8-evidence.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createId, Role } from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { createApp } from "../src/create-app";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";
import { createAppPrisma } from "../src/prisma/create-prisma";

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const url = env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: url });
  const raw = new PrismaClient({ adapter });
  await raw.$connect();

  const evidenceEmail = `evidence-admin-${Date.now()}@example.com`;
  const password = "EvidencePass1!";
  const prisma = createAppPrisma(url);
  const adminId = createId();

  await runWithActorContextAsync(
    { source: "cli", actorLabel: "cli:create-admin", requestId: null, ip: null },
    async () => {
      await prisma.user.create({
        data: {
          id: adminId,
          email: evidenceEmail,
          name: "Evidence Admin",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });
    },
  );

  process.env.E2E = "1";
  const nestApp = await createApp({ enableSwagger: false, enableBullBoard: false });
  await nestApp.listen(0, "127.0.0.1");
  const address = nestApp.getHttpServer().address();
  const port = typeof address === "object" && address ? address.port : 0;
  const origin = "http://localhost:5173";

  async function post(
    path: string,
    body: Record<string, string>,
    cookie?: string,
  ) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const setCookie =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return {
      status: res.status,
      body: await res.json().catch(() => null),
      setCookie,
    };
  }

  await post("/api/auth/login", {
    email: evidenceEmail,
    password: "wrong-password!!",
  });
  const ok = await post("/api/auth/login", { email: evidenceEmail, password });
  const cookie = ok.setCookie.map((c) => c.split(";")[0]).join("; ");
  await post(
    "/api/auth/change-password",
    { currentPassword: password, newPassword: "EvidencePass2!" },
    cookie,
  );

  // Evidence-only: read/verify append-only triggers outside the prisma helper surface.
  // eslint-disable-next-line no-restricted-syntax -- Task 8 evidence dump
  const rows = await raw.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `
    SELECT action, source, actor_label,
           actor_user_id::text AS actor_user_id,
           entity_type, entity_id::text AS entity_id,
           occurred_at
    FROM audit_log
    WHERE actor_user_id = $1::uuid
       OR (after->>'email') = $2
       OR occurred_at > now() - interval '2 minutes'
    ORDER BY occurred_at DESC
    LIMIT 30
  `,
    adminId,
    evidenceEmail,
  );

  let updateErr = "no error";
  let deleteErr = "no error";
  try {
    // eslint-disable-next-line no-restricted-syntax -- prove append-only UPDATE rejection
    await raw.$executeRawUnsafe(
      `UPDATE audit_log SET action = 'X' WHERE id = (SELECT id FROM audit_log ORDER BY occurred_at DESC LIMIT 1)`,
    );
  } catch (e) {
    updateErr = e instanceof Error ? e.message : String(e);
  }
  try {
    // eslint-disable-next-line no-restricted-syntax -- prove append-only DELETE rejection
    await raw.$executeRawUnsafe(
      `DELETE FROM audit_log WHERE id = (SELECT id FROM audit_log ORDER BY occurred_at DESC LIMIT 1)`,
    );
  } catch (e) {
    deleteErr = e instanceof Error ? e.message : String(e);
  }

  const out = {
    evidenceEmail,
    adminId,
    loginStatus: ok.status,
    rows,
    updateErr,
    deleteErr,
  };

  const dir = resolve(process.cwd(), "../../docs/evidence/task-8");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, "sql-evidence.json"),
    JSON.stringify(
      out,
      (_k, v) => (typeof v === "bigint" ? Number(v) : v),
      2,
    ),
  );
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2));

  await nestApp.close();
  await prisma.$disconnect();
  await raw.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
