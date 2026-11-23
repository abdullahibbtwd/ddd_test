/**
 * Task 10 evidence: create / update / archive a client via the HTTP API and
 * dump the resulting audit_log rows.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task10-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClientKind, createId, Role } from "@ddcrm/shared";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { createApp } from "../src/create-app";
import { createAppPrisma } from "../src/prisma/create-prisma";

function eikFromPrefix(prefix8: string): string {
  const d = prefix8.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += d[i]! * (i + 1);
  let r = sum % 11;
  if (r === 10) {
    sum = 0;
    for (let i = 0; i < 8; i++) sum += d[i]! * (i + 3);
    r = sum % 11;
    if (r === 10) r = 0;
  }
  return `${prefix8}${r}`;
}

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
  const app = await createApp({ enableSwagger: false, enableBullBoard: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = createAppPrisma(process.env.DATABASE_URL!);
  const password = "Evidence-Admin-Pass1!";
  const adminId = createId();
  const eik = eikFromPrefix(String(40000000 + (Date.now() % 50000000)).padStart(8, "0"));

  await runWithActorContextAsync(
    {
      source: "cli",
      actorLabel: "cli:task10-evidence",
      actorUserId: null,
      requestId: null,
      ip: null,
    },
    async () => {
      await prisma.user.create({
        data: {
          id: adminId,
          email: `evidence-clients-${Date.now()}@e2e.local`,
          name: "Evidence Clients Admin",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });
    },
  );

  const inject = app.inject.bind(app);
  const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  const login = await inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email: admin.email, password },
  });
  const setCookie = login.headers["set-cookie"];
  const cookies = (Array.isArray(setCookie) ? setCookie : [String(setCookie)])
    .map((c) => c.split(";")[0])
    .join("; ");

  const create = await inject({
    method: "POST",
    url: "/api/clients",
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: {
      kind: ClientKind.COMPANY,
      name: "Евидънс Клиент ЕООД",
      eik,
      email: "Evidence@Example.BG",
      phone: "0888123456",
    },
  });
  if (create.statusCode !== 201) {
    throw new Error(`create failed: ${create.statusCode} ${create.body}`);
  }
  const clientId = create.json().id as string;

  const update = await inject({
    method: "PATCH",
    url: `/api/clients/${clientId}`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: { name: "Евидънс Клиент ООД" },
  });
  if (update.statusCode !== 200) {
    throw new Error(`update failed: ${update.statusCode} ${update.body}`);
  }

  const archive = await inject({
    method: "PATCH",
    url: `/api/clients/${clientId}`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: { isActive: false },
  });
  if (archive.statusCode !== 200) {
    throw new Error(`archive failed: ${archive.statusCode} ${archive.body}`);
  }

  // Evidence script: one-off audit dump; Prisma helper would still need raw SQL.
  // eslint-disable-next-line no-restricted-syntax -- evidence SQL dump for docs/evidence/task-10
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id::text, action, entity_type, entity_id::text, actor_user_id::text,
            changed_fields, occurred_at
     FROM audit_log
     WHERE entity_type = 'clients' AND entity_id = '${clientId}'
     ORDER BY occurred_at ASC`,
  );

  const outDir = resolve(process.cwd(), "../../docs/evidence/task-10");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "audit-sql.json"),
    `${JSON.stringify({ clientId, eik, actorUserId: adminId, rows }, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ clientId, eik, actorUserId: adminId, rowCount: rows.length, rows }, null, 2));

  await app.close();
  await prisma.$disconnect().catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
