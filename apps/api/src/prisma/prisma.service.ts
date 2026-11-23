import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "../config/config.service";
import {
  createAppPrisma,
  type AppPrismaClient,
  type AppTransactionClient,
  type TransactionOptions,
} from "./create-prisma";
import { runAppTransaction } from "./run-transaction";

/**
 * Nest-injectable Prisma client with the actor-context extension.
 * Use `.transaction(fn)` for multi-step writes — never call `$transaction`.
 *
 * Declaration merge gives inject sites the full AppPrismaClient surface while
 * keeping `PrismaService` as the Nest DI token (standard Nest+Prisma pattern).
 *
 * The backing field is named `db` (not `client`) so it does not collide with the
 * Prisma model accessor `prisma.client` for the `Client` / `clients` table.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Nest DI + Prisma client shape
export interface PrismaService extends AppPrismaClient {}

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Nest DI + Prisma client shape
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly db: AppPrismaClient;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.db = createAppPrisma(config.databaseUrl);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (
          prop === "onModuleInit" ||
          prop === "onModuleDestroy" ||
          prop === "db" ||
          prop === "transaction"
        ) {
          return Reflect.get(target, prop, receiver);
        }
        const value = Reflect.get(target.db, prop, target.db);
        return typeof value === "function" ? value.bind(target.db) : value;
      },
    }) as unknown as PrismaService;
  }

  /**
   * Interactive transaction with actor settings. Nested calls reuse the outer tx.
   */
  transaction<T>(
    fn: (tx: AppTransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return runAppTransaction(this.db, fn, options);
  }

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
