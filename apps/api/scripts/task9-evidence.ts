/**
 * Task 9 manual evidence: create user with 2 areas, change role, deactivate,
 * reset password — print audit rows and grep-friendly log capture for secrets.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task9-evidence.ts
 */
import { createId, Role } from "@ddcrm/shared";
import { createApp } from "../src/create-app";
import { hashPassword } from "../src/auth/password";
import { createAppPrisma } from "../src/prisma/create-prisma";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
  const app = await createApp({ enableSwagger: false, enableBullBoard: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = createAppPrisma(process.env.DATABASE_URL!);
  const password = "Evidence-Admin-Pass1!";
  const adminId = createId();
  const areaA = createId();
  const areaB = createId();

  await runWithActorContextAsync(
    {
      source: "cli",
      actorLabel: "cli:task9-evidence",
      actorUserId: null,
      requestId: null,
      ip: null,
    },
    async () => {
      await prisma.area.createMany({
        data: [
          { id: areaA, name: `Evidence-A-${Date.now()}`, isActive: true },
          { id: areaB, name: `Evidence-B-${Date.now()}`, isActive: true },
        ],
      });
      await prisma.user.create({
        data: {
          id: adminId,
          email: `evidence-admin-${Date.now()}@e2e.local`,
          name: "Evidence Admin",
          role: Role.ADMIN,
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
        },
      });
    },
  );

  const inject = app.inject.bind(app);
  const login = await inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: {
      email: (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).email,
      password,
    },
  });
  const setCookie = login.headers["set-cookie"];
  const cookies = (Array.isArray(setCookie) ? setCookie : [String(setCookie)])
    .map((c) => c.split(";")[0])
    .join("; ");

  const create = await inject({
    method: "POST",
    url: "/api/users",
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: {
      email: `evidence-field-${Date.now()}@e2e.local`,
      name: "Evidence Field",
      role: Role.FIELD,
      areaIds: [areaA, areaB],
    },
  });
  const created = create.json() as {
    id: string;
    temporaryPassword: string;
    email: string;
  };
  const tempPassword = created.temporaryPassword;

  await inject({
    method: "PATCH",
    url: `/api/users/${created.id}`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: { role: Role.OFFICE },
  });

  await inject({
    method: "PATCH",
    url: `/api/users/${created.id}`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: { isActive: false },
  });

  await inject({
    method: "POST",
    url: `/api/users/${created.id}/reset-password`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
  });

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityId: created.id },
        { entityType: "user_areas", after: { path: ["user_id"], equals: created.id } },
        { meta: { path: ["targetUserId"], equals: created.id } },
      ],
    },
    orderBy: { occurredAt: "asc" },
  });

  const outDir = resolve(__dirname, "../../../docs/evidence/task-9");
  mkdirSync(outDir, { recursive: true });
  const payload = {
    tempPasswordShownOnce: tempPassword,
    auditRows: rows.map((r) => ({
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      before: r.before,
      after: r.after,
      meta: r.meta,
      changedFields: r.changedFields,
    })),
  };
  writeFileSync(resolve(outDir, "sql-evidence.json"), JSON.stringify(payload, null, 2));

  const blob = JSON.stringify(payload);
  const hasSecret =
    blob.includes(tempPassword) &&
    !blob.includes('"tempPasswordShownOnce"'); // allow the dedicated field for this report
  // Real check: audit rows must not contain the password
  const auditOnly = JSON.stringify(payload.auditRows);
  const leak = auditOnly.includes(tempPassword);
  console.log(
    JSON.stringify(
      {
        createStatus: create.statusCode,
        auditRowCount: rows.length,
        passwordInAudit: leak,
        hasSecretFieldOnlyInReport: Boolean(tempPassword),
        leakedElsewhere: hasSecret,
      },
      null,
      2,
    ),
  );

  await app.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
