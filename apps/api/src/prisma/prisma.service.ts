import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Prisma with request-scoped tenant RLS context.
 * Authenticated requests run inside a transaction after
 * set_config('app.tenant_id', …, true) so FORCE RLS policies apply.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly als = new AsyncLocalStorage<Prisma.TransactionClient>();

  /** Prefer this over `this` so RLS transaction context is used when present. */
  get db(): DbClient {
    return this.als.getStore() ?? this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      return this.als.run(tx, fn);
    });
  }

  /** Auth bootstrap / seed paths that must see cross-tenant rows briefly. */
  async runWithBypass<T>(fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return this.als.run(tx, fn);
    });
  }
}
