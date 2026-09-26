import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

const FLAGS = ['numbering', 'masterData', 'approvalRules', 'notifications', 'audit'];

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const categories = mongoose.connection.db.collection('categories');
  const set = Object.fromEntries(FLAGS.map((f) => [`privileges.portalManagement.${f}`, true]));
  const result = await categories.updateMany({ role: 'superAdmin' }, { $set: set });
  console.log(`Granted settings privileges to ${result.modifiedCount} superAdmin categories`);
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const unset = Object.fromEntries(FLAGS.map((f) => [`privileges.portalManagement.${f}`, '']));
  await mongoose.connection.db.collection('categories').updateMany({}, { $unset: unset });
}
