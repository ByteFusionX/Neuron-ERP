import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

const VIEW_TO_EDIT: Record<string, string> = {
  numbering: 'numberingEdit',
  masterData: 'masterDataEdit',
  approvalRules: 'approvalRulesEdit',
  notifications: 'notificationsEdit',
  audit: 'auditEdit',
};
const NEW_FLAGS = [...Object.values(VIEW_TO_EDIT), 'companyProfileEdit'];

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const categories = mongoose.connection.db.collection('categories');
  // Anyone who could view a section before could also edit it, so keep that behaviour.
  for (const [view, edit] of Object.entries(VIEW_TO_EDIT)) {
    await categories.updateMany(
      { [`privileges.portalManagement.${view}`]: true },
      { $set: { [`privileges.portalManagement.${edit}`]: true } }
    );
  }
  // The profile was editable by everyone; keep it for admin roles only.
  const result = await categories.updateMany(
    { role: { $in: ['admin', 'superAdmin'] } },
    { $set: { 'privileges.portalManagement.companyProfileEdit': true } }
  );
  console.log(`Granted companyProfileEdit to ${result.modifiedCount} categories`);
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const unset = Object.fromEntries(NEW_FLAGS.map((f) => [`privileges.portalManagement.${f}`, '']));
  await mongoose.connection.db.collection('categories').updateMany({}, { $unset: unset });
}
