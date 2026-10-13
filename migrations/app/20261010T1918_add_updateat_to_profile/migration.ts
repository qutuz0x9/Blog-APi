#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract';
import startContract from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d77942f96352790fa81fa546e3c6a5e724f6c48d25c8232f58372f1fe587f74d/contract';
import endContract from '../../snapshots/d77942f96352790fa81fa546e3c6a5e724f6c48d25c8232f58372f1fe587f74d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';
// Node has no built-in Temporal yet; the timestamp column values are Temporal instants
import 'temporal-polyfill/global';

// Query builder over the END contract. It connects lazily, so no database is opened here.
const { sql: db, contract } = postgres<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Profile',
        column: col('updatedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      // Existing profiles get "now" as their updatedAt, so the column can become NOT NULL.
      this.dataTransform(contract, 'backfill-Profile-updatedAt', {
        // "work remains" while any row still has no updatedAt
        check: () => db.public.Profile.select('id').where((f, fns) => fns.eq(f.updatedAt, null)).limit(1),
        run: () =>
          db.public.Profile.update({ updatedAt: Temporal.Now.instant() }).where((f, fns) =>
            fns.eq(f.updatedAt, null),
          ),
      }),
      this.setNotNull({ schema: 'public', table: 'Profile', column: 'updatedAt' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
