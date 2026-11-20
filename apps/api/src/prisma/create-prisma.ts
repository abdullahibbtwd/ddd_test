import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { actorContextExtension } from "./actor-extension";
import {
  runAppTransaction,
  type AppTransactionClient,
  type TransactionOptions,
} from "./run-transaction";

function buildExtendedClient(connectionString: string) {
  const adapter = new PrismaPg({ connectionString });
  const base = new PrismaClient({ adapter });
  return base.$extends(actorContextExtension());
}

type ExtendedClient = ReturnType<typeof buildExtendedClient>;

export type AppPrismaClient = ExtendedClient & {
  transaction: <T>(
    fn: (tx: AppTransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ) => Promise<T>;
};

export function createAppPrisma(connectionString: string): AppPrismaClient {
  const client = buildExtendedClient(connectionString);
  const withTx = client as AppPrismaClient;
  withTx.transaction = <T>(
    fn: (tx: AppTransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ) => runAppTransaction(client, fn, options);
  return withTx;
}

export type { AppTransactionClient, TransactionOptions };
