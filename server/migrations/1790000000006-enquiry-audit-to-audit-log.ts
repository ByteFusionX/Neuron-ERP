import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const db = mongoose.connection.db;
  const old = db.collection('enquiryaudits');
  const auditLogs = db.collection('auditlogs');

  // Copy enquiry history into the global audit log, keeping _id so re-running cannot duplicate rows.
  let copied = 0;
  const cursor = old.find({});
  for await (const doc of cursor) {
    const result = await auditLogs.updateOne(
      { _id: doc._id },
      {
        $setOnInsert: {
          entityType: 'enquiry',
          entityId: doc.enquiry,
          action: doc.action,
          summary: doc.summary,
          changes: doc.changes,
          actor: doc.actor,
          actorName: doc.actorName,
          at: doc.at,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount) copied++;
  }
  console.log(`Copied ${copied} enquiry audit entries into auditlogs`);
  // The old enquiryaudits collection is left in place as a backup.
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  await mongoose.connection.db.collection('auditlogs').deleteMany({ entityType: 'enquiry' });
}
