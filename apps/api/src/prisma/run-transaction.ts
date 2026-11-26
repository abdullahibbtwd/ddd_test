import {
  getTransactionClient,
  isInTransaction,
  runWithInTransactionAsync,
} from "../audit/actor-context";
import { applyActorSettings, type ActorSettingClient } from "./actor-extension";

/** Interactive transaction client: model delegates + raw helpers used in tx. */
export type AppTransactionClient = ActorSettingClient & {
  // Model delegates are accessed dynamically; keep structural typing loose
  // enough for User / AuthSession / AuditLog writes used by the app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auditLog: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  area: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userArea: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  site: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  siteType: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscription: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitEmployee: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoiceLine: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoiceVisit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoiceCounter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emailEvent: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payment: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cashHandover: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitProduct: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monitoringPoint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monitoringPointCheck: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientEmployee: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthCertificate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agreement: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodSamplingSchedule: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodSampleRecord: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storedFile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRaw: any;
};

export type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?:
    | "ReadUncommitted"
    | "ReadCommitted"
    | "RepeatableRead"
    | "Serializable";
};

type TransactionCapable = {
  $transaction: <T>(
    fn: (tx: ActorSettingClient) => Promise<T>,
    options?: TransactionOptions,
  ) => Promise<T>;
};

/**
 * The ONLY supported way to open an interactive transaction.
 * Sets actor config once, then runs fn(tx) with inTransaction=true so the
 * write extension does not double-wrap. Nested calls reuse the outer tx.
 */
export async function runAppTransaction<T>(
  client: TransactionCapable,
  fn: (tx: AppTransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  if (isInTransaction()) {
    const existing = getTransactionClient<AppTransactionClient>();
    if (!existing) {
      throw new Error("inTransaction set but no transaction client in ALS");
    }
    return fn(existing);
  }

  // Allowed: this file lives under apps/api/src/prisma/
  return client.$transaction(async (tx) => {
    await applyActorSettings(tx);
    return runWithInTransactionAsync(tx, () => fn(tx as unknown as AppTransactionClient));
  }, options);
}
