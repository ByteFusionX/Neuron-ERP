import type { Connection } from 'mongoose';

export async function up(connection: Connection): Promise<void> {
  await connection.collection('customers').updateMany(
    { shippingSites: { $exists: true } },
    { $unset: { shippingSites: '' } },
  );
}

export async function down(): Promise<void> {
}
