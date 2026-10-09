#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/29a1922ef12aae4c914ed16b5f1226f08160931c8a515098d1f7a2d8b839e1db/contract';
import startContract from '../../snapshots/29a1922ef12aae4c914ed16b5f1226f08160931c8a515098d1f7a2d8b839e1db/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b1baa254842fe043e49526ef0f8470ab5e9a28683d460e4ff1ce5c90175d5ef8/contract';
import endContract from '../../snapshots/b1baa254842fe043e49526ef0f8470ab5e9a28683d460e4ff1ce5c90175d5ef8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Tag',
        column: col('createdAt', 'timestamptz', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
