/**
 * Task 12 evidence:
 *   - exclusion constraint rejecting an overlap (SQL)
 *   - audit rows for subscription create + site terminate auto-end (same actor)
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/task12-evidence.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createId,
  Role,
  ServiceType,
  SiteStatus,
  SubscriptionFrequency,
} from "@ddcrm/shared";
import { runWithActorContextAsync } from "../src/audit/actor-context";
import { hashPassword } from "../src/auth/password";
import { createApp } from "../src/create-app";
import { createAppPrisma } from "../src/prisma/create-prisma";

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "development";
  const app = await createApp({ enableSwagger: false, enableBullBoard: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = createAppPrisma(process.env.DATABASE_URL!);
  const password = "Evidence-Admin-Pass1!";
  const adminId = createId();
  const outDir = resolve(process.cwd(), "../../docs/evidence/task-12");
  mkdirSync(outDir, { recursive: true });

  await runWithActorContextAsync(
    {
      source: "cli",
      actorLabel: "cli:task12-evidence",
      actorUserId: null,
      requestId: null,
      ip: null,
    },
    async () => {
      await prisma.user.create({
        data: {
          id: adminId,
          email: `evidence-sub-${Date.now()}@e2e.local`,
          name: "Evidence Sub Admin",
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

  const area = await prisma.area.findFirstOrThrow({ where: { isActive: true } });
  const type = await prisma.siteType.findFirstOrThrow({ where: { isActive: true } });
  const client = await prisma.client.findFirstOrThrow({ where: { isActive: true } });

  const site = await inject({
    method: "POST",
    url: "/api/sites",
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: {
      clientId: client.id,
      areaId: area.id,
      siteTypeId: type.id,
      name: `Evidence Sub Site ${Date.now()}`,
      address: "ул. Evidence 12",
    },
  });
  const siteId = site.json().id as string;

  const created = await inject({
    method: "POST",
    url: "/api/subscriptions",
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: {
      siteId,
      services: [ServiceType.INSECT_CONTROL],
      frequency: SubscriptionFrequency.MONTHLY,
      rate: 50,
      rateIncludesVat: false,
      startDate: "2020-01-01",
    },
  });
  const subId = created.json().id as string;

  await inject({
    method: "PATCH",
    url: `/api/sites/${siteId}`,
    headers: { origin: "http://localhost:5173", cookie: cookies },
    payload: { status: SiteStatus.TERMINATED },
  });

  const audit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "subscriptions", entityId: subId },
        { entityType: "sites", entityId: siteId },
      ],
    },
    orderBy: { occurredAt: "asc" },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      actorUserId: true,
      actorLabel: true,
      occurredAt: true,
    },
  });
  const auditText = JSON.stringify(audit, null, 2);
  console.log("--- audit: create subscription + terminate site (same actor) ---");
  console.log(auditText);
  writeFileSync(resolve(outDir, "audit-rows.json"), auditText);

  // Exclusion constraint evidence
  const overlapSite = createId();
  await runWithActorContextAsync(
    {
      source: "cli",
      actorLabel: "cli:task12-evidence",
      actorUserId: adminId,
      requestId: null,
      ip: null,
    },
    async () => {
      await prisma.site.create({
        data: {
          id: overlapSite,
          clientId: client.id,
          areaId: area.id,
          siteTypeId: type.id,
          name: `Overlap ${overlapSite.slice(0, 8)}`,
          address: "Overlap",
          status: SiteStatus.ACTIVE,
          notes: "__task12_evidence__",
        },
      });
    },
  );

  // eslint-disable-next-line no-restricted-syntax -- evidence: show raw exclusion failure
  await prisma.$executeRawUnsafe(`
    INSERT INTO subscriptions (
      id, site_id, services, frequency, rate, rate_includes_vat,
      start_date, end_date, created_at, updated_at
    ) VALUES (
      '${createId()}'::uuid, '${overlapSite}'::uuid,
      ARRAY['INSECT_CONTROL']::"ServiceType"[],
      'MONTHLY', 50.00, false,
      '2026-01-01'::date, NULL, NOW(), NOW()
    )
  `);

  let exclusionOut = "first insert OK\n";
  try {
    // eslint-disable-next-line no-restricted-syntax -- evidence: show raw exclusion failure
    await prisma.$executeRawUnsafe(`
      INSERT INTO subscriptions (
        id, site_id, services, frequency, rate, rate_includes_vat,
        start_date, end_date, created_at, updated_at
      ) VALUES (
        '${createId()}'::uuid, '${overlapSite}'::uuid,
        ARRAY['RODENT_CONTROL']::"ServiceType"[],
        'MONTHLY', 60.00, false,
        '2026-03-01'::date, '2026-06-01'::date, NOW(), NOW()
      )
    `);
    exclusionOut += "ERROR: overlap succeeded\n";
  } catch (error) {
    exclusionOut += `overlap rejected:\n${String(error)}\n`;
  }
  console.log("--- exclusion ---");
  console.log(exclusionOut);
  writeFileSync(resolve(outDir, "exclusion.txt"), exclusionOut);

  await app.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
