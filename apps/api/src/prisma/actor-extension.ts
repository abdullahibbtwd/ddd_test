import { Logger } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { getActorContext, isInTransaction } from "../audit/actor-context";

const logger = new Logger("PrismaActorExtension");

const WRITE_OPS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

export type ActorSettingClient = {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Prisma.PrismaPromise<unknown>;
};

function actorSettingValues(): {
  source: string;
  actorId: string;
  actorLabel: string;
  requestId: string;
  ip: string;
  missing: boolean;
} {
  const ctx = getActorContext();
  return {
    // Empty string → trigger treats as null via nullif(..., '').
    source: ctx?.source ?? "system",
    actorId: ctx?.actorUserId ?? "",
    actorLabel: ctx?.actorLabel ?? "",
    requestId: ctx?.requestId ?? "",
    ip: ctx?.ip ?? "",
    missing: !ctx,
  };
}

/**
 * One round-trip that sets all five transaction-local settings (is_local = true).
 * NEVER use session-level set_config — pooled connections would leak actors.
 */
export function setActorConfigQuery(client: ActorSettingClient) {
  const v = actorSettingValues();
  return client.$executeRaw`
    SELECT
      set_config('app.source', ${v.source}, true),
      set_config('app.actor_id', ${v.actorId}, true),
      set_config('app.actor_label', ${v.actorLabel}, true),
      set_config('app.request_id', ${v.requestId}, true),
      set_config('app.ip', ${v.ip}, true)
  `;
}

export async function applyActorSettings(client: ActorSettingClient): Promise<void> {
  await setActorConfigQuery(client);
}

/**
 * Hybrid actor-context extension (Task 8):
 * - Standalone writes → base `$transaction([set_config, write])` (Prisma RLS pattern).
 * - Writes inside `PrismaService.transaction()` → call `query(args)` directly
 *   because `inTransaction` is set in AsyncLocalStorage.
 * - Reads are untouched.
 */
export function actorContextExtension() {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: "actorContext",
      query: {
        async $allOperations({ operation, model, args, query }) {
          if (
            operation === "$executeRaw" ||
            operation === "$executeRawUnsafe" ||
            operation === "$queryRaw" ||
            operation === "$queryRawUnsafe" ||
            operation === "$transaction"
          ) {
            return query(args);
          }

          const isWrite = model !== undefined && WRITE_OPS.has(operation);
          if (!isWrite) {
            return query(args);
          }

          if (isInTransaction()) {
            return query(args);
          }

          const ctx = getActorContext();
          if (!ctx) {
            logger.warn(
              `Database write without actor context (model=${model}, operation=${operation}); recording as source=system with null actor`,
            );
          }

          // `prisma` here is the client *before* this extension — safe to call
          // $transaction without re-entering our write wrapper for set_config.
          const [, result] = await prisma.$transaction([
            setActorConfigQuery(prisma),
            query(args),
          ]);
          return result;
        },
      },
    }),
  );
}
