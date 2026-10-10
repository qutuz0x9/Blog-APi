#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract';
import endContract from '../../snapshots/60a1aaedf83a9dfbb48dfd8c20c039f546bd6e85651ed5e414db397bd6373852/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b7d88119db71b5b5819a97db888a9a095915fb8d00456aeca6e7515e6284ed96/contract';
import startContract from '../../snapshots/b7d88119db71b5b5819a97db888a9a095915fb8d00456aeca6e7515e6284ed96/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropColumn({ schema: 'public', table: 'AuditLog', column: 'updatedAt' })];
  }
}

MigrationCLI.run(import.meta.url, M);
