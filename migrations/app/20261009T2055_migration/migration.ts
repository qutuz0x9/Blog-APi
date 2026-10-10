#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract';
import startContract from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b7d88119db71b5b5819a97db888a9a095915fb8d00456aeca6e7515e6284ed96/contract';
import endContract from '../../snapshots/b7d88119db71b5b5819a97db888a9a095915fb8d00456aeca6e7515e6284ed96/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'AuditLog',
        column: col('updatedAt', 'timestamptz', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
