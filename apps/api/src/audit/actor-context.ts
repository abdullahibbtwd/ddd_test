import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditSource } from "@ddcrm/shared";

export type ActorContext = {
  source: AuditSource;
  actorUserId?: string | null;
  actorLabel?: string | null;
  requestId?: string | null;
  ip?: string | null;
};

/** Store for PrismaService.transaction() — marks in-tx and holds the tx client. */
export type TransactionStore = {
  inTransaction: true;
  // Opaque tx client from Prisma interactive $transaction callback.
  tx: unknown;
};

const actorStorage = new AsyncLocalStorage<ActorContext>();
const txStorage = new AsyncLocalStorage<TransactionStore>();

export function getActorContext(): ActorContext | undefined {
  return actorStorage.getStore();
}

/** Bind context for the remainder of the current async chain (HTTP onRequest). */
export function enterActorContext(ctx: ActorContext): void {
  actorStorage.enterWith(ctx);
}

/**
 * Patch the current context (e.g. after JWT resolves the user).
 * Mutates the existing store in place so Fastify onRequest → Nest guard →
 * handler share one ALS frame. A fresh enterWith() from the guard would bind
 * only to the guard's async resource and leave the handler with the original
 * onRequest values (null actor).
 */
export function updateActorContext(patch: Partial<ActorContext>): void {
  const current = actorStorage.getStore();
  if (current) {
    Object.assign(current, patch);
    return;
  }
  actorStorage.enterWith({ source: "system", ...patch });
}

export function runWithActorContext<T>(ctx: ActorContext, fn: () => T): T {
  return actorStorage.run(ctx, fn);
}

export async function runWithActorContextAsync<T>(
  ctx: ActorContext,
  fn: () => Promise<T>,
): Promise<T> {
  return actorStorage.run(ctx, fn);
}

export function isInTransaction(): boolean {
  return txStorage.getStore()?.inTransaction === true;
}

export function getTransactionClient<T = unknown>(): T | undefined {
  return txStorage.getStore()?.tx as T | undefined;
}

export function runWithInTransaction<T>(tx: unknown, fn: () => T): T {
  return txStorage.run({ inTransaction: true, tx }, fn);
}

export async function runWithInTransactionAsync<T>(
  tx: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  return txStorage.run({ inTransaction: true, tx }, fn);
}
