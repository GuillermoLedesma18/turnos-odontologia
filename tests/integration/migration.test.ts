import { afterAll, describe, expect, it } from 'vitest';

import { testPrisma } from '../helpers/test-db';

const MIGRATION_NAME = '20261110135347_core_models';

const DOMAIN_TABLES = [
  'Appointment',
  'AuditLog',
  'AvailabilityBlock',
  'BlockedSlot',
  'Dentist',
  'NotificationLog',
  'Patient',
  'TreatmentType',
];

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe('estado de la Migración 001', () => {
  it('la migración está aplicada y no quedó revertida', async () => {
    const rows = await testPrisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      WHERE migration_name = ${MIGRATION_NAME}
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.finished_at).not.toBeNull();
    expect(rows[0]?.rolled_back_at).toBeNull();
  });

  it('crea las ocho tablas de dominio y la extensión btree_gist', async () => {
    const tables = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    const domainTables = tables
      .map((table) => table.tablename)
      .filter((table) => DOMAIN_TABLES.includes(table))
      .sort();
    const otherTables = tables
      .map((table) => table.tablename)
      .filter((table) => !DOMAIN_TABLES.includes(table) && table !== '_prisma_migrations')
      .sort();

    expect(domainTables).toEqual([...DOMAIN_TABLES].sort());
    expect(otherTables).toEqual([]);

    const extensions = await testPrisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(extensions).toHaveLength(1);
  });
});
