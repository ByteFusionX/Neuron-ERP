import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const categories = mongoose.connection.db.collection('categories');
  // The Roles & Privileges page used to be superAdmin-only, so only superAdmin gets the flags.
  const result = await categories.updateMany(
    { role: 'superAdmin' },
    { $set: { 'privileges.roles': { view: true, create: true, edit: true, delete: true } } }
  );
  console.log(`Granted roles privileges on ${result.modifiedCount} categories`);
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }

  const categories = mongoose.connection.db.collection('categories');
  await categories.updateMany({}, { $unset: { 'privileges.roles': '' } });
}
